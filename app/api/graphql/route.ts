import { NextResponse } from "next/server";
import { setDefaultResultOrder } from "node:dns";
import { features } from "@/config/features";

// Belt-and-suspenders with instrumentation.ts: this dev machine's IPv6 route to
// the upstream is unreachable, and undici (Node fetch) resolves AAAA/IPv6 first
// → intermittent "fetch failed". Forcing IPv4 here guarantees the order is set
// in-process even if the startup instrumentation hook didn't run. Harmless
// where IPv6 works (still just prefers IPv4). Idempotent, runs on module load.
setDefaultResultOrder("ipv4first");

/* Server-only, so no NEXT_PUBLIC_ prefix — this must never reach the client
   bundle.

   NO fallback domain, deliberately. Two Vercel projects build this same code
   and differ only by this variable, so a default would silently send one
   project's traffic to the other project's API — the failure mode that had
   production calling a host nobody configured. Missing config fails loudly
   instead (see the guard in POST). */
const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;

// How many times to retry a failed upstream fetch, and the base backoff.
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 300;

/**
 * Fetch the upstream endpoint with retries. Node's fetch (undici) can throw
 * "fetch failed" on a transient connection error — notably when it tries an
 * unreachable IPv6 route on this dev machine before the IPv4 fallback. A short
 * retry rides over those blips instead of surfacing them to the client (which,
 * during the 16-batch background load, would abort the whole run).
 */
/**
 * Upstream API key. Read from the environment ONLY.
 *
 * No literal fallback: a hardcoded default ships the secret in the source and,
 * once pushed, lives in git history permanently. Set it in `.env.local`, which
 * `.gitignore` already excludes.
 *
 * Deliberately NOT `NEXT_PUBLIC_` — Next inlines those into the client bundle,
 * where anyone loading the page could read it. This route runs server-side, so
 * the key never needs to reach the browser.
 */
/* No fallback value: the key comes from the environment or not at all, so a
   missing variable can never be papered over with an empty credential. */
const KLEVER_API_KEY = process.env.KLEVER_API_KEY;

async function fetchUpstream(body: unknown, endpoint: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const started = Date.now();
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          // Omitted entirely when unset, rather than sent as an empty string.
          ...(KLEVER_API_KEY ? { "X-Klever-Api-Key": KLEVER_API_KEY } : {}),
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      /* Diagnostics: which host answered, with what status, and whether an auth
         header was attached. The KEY ITSELF IS NEVER LOGGED — only a boolean and
         its length, which is enough to tell "unset" from "set but wrong" without
         leaking the secret. Logged on failure only, so a healthy proxy stays
         quiet. A 401 here with `keyPresent: true` means the host rejected the
         request before authentication (what www.tyrescart.com does today);
         a 403 means the key reached Magento and was refused. */
      if (!upstream.ok) {
        console.warn("[graphql proxy] upstream rejected:", {
          endpoint,
          status: upstream.status,
          keyPresent: Boolean(KLEVER_API_KEY),
          keyLength: KLEVER_API_KEY ? KLEVER_API_KEY.length : 0,
          ms: Date.now() - started,
          attempt,
        });
      }
      return upstream;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[graphql proxy] upstream fetch attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
        err,
      );
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * attempt));
      }
    }
  }
  throw lastErr;
}

export async function POST(req: Request) {
  if (!features.graphqlProxy) {
    return NextResponse.json(
      { errors: [{ message: "GraphQL Proxy feature is disabled." }] },
      { status: 403 },
    );
  }
  if (!GRAPHQL_ENDPOINT) {
    console.error(
      "[graphql proxy] GRAPHQL_ENDPOINT is not set — refusing to guess an upstream host.",
    );
    return NextResponse.json(
      {
        errors: [
          {
            message:
              "GRAPHQL_ENDPOINT is not configured on this deployment. Set it in the environment (no NEXT_PUBLIC_ prefix) and redeploy.",
          },
        ],
      },
      { status: 500 },
    );
  }
  try {
    const body = await req.json();
    const response = await fetchUpstream(body, GRAPHQL_ENDPOINT);

    const rawText = await response.text();

    try {
      const data = JSON.parse(rawText);
      return NextResponse.json(data, { status: response.status || 200 });
    } catch {
      console.warn(
        "GraphQL Proxy received non-JSON payload from Magento endpoint:",
        rawText.slice(0, 300),
      );
      return NextResponse.json(
        {
          errors: [
            {
              message:
                rawText ||
                "Magento GraphQL endpoint returned non-JSON HTML/text response.",
            },
          ],
        },
        { status: response.status || 500 },
      );
    }
  } catch (error) {
    console.error("GraphQL Proxy internal error:", error);
    return NextResponse.json(
      {
        errors: [
          {
            message:
              error instanceof Error
                ? error.message
                : "Failed to proxy GraphQL request",
          },
        ],
      },
      { status: 500 },
    );
  }
}
