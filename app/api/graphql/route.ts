import { NextResponse } from "next/server";
import { setDefaultResultOrder } from "node:dns";

// Belt-and-suspenders with instrumentation.ts: this dev machine's IPv6 route to
// the upstream is unreachable, and undici (Node fetch) resolves AAAA/IPv6 first
// → intermittent "fetch failed". Forcing IPv4 here guarantees the order is set
// in-process even if the startup instrumentation hook didn't run. Harmless
// where IPv6 works (still just prefers IPv4). Idempotent, runs on module load.
setDefaultResultOrder("ipv4first");

const GRAPHQL_ENDPOINT = "https://www.tyrescart.com/graphql";

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
const KLEVER_API_KEY = process.env.KLEVER_API_KEY ?? "";

async function fetchUpstream(body: unknown): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Klever-Api-Key": KLEVER_API_KEY,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch (err) {
      lastErr = err;
      console.warn(`[graphql proxy] upstream fetch attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * attempt));
      }
    }
  }
  throw lastErr;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const response = await fetchUpstream(body);

    const rawText = await response.text();

    try {
      const data = JSON.parse(rawText);
      return NextResponse.json(data, { status: response.status || 200 });
    } catch {
      console.warn("GraphQL Proxy received non-JSON payload from Magento endpoint:", rawText.slice(0, 300));
      return NextResponse.json(
        {
          errors: [
            {
              message: rawText || "Magento GraphQL endpoint returned non-JSON HTML/text response.",
            },
          ],
        },
        { status: response.status || 500 }
      );
    }
  } catch (error) {
    console.error("GraphQL Proxy internal error:", error);
    return NextResponse.json(
      { errors: [{ message: error instanceof Error ? error.message : "Failed to proxy GraphQL request" }] },
      { status: 500 }
    );
  }
}
