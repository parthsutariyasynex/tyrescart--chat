import { NextResponse } from "next/server";
import {
  createSessionToken,
  safeEqual,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/services/session";

/**
 * Validates credentials against AUTH_USERNAME / AUTH_PASSWORD (server-only —
 * see .env.example) and, on success, sets the HttpOnly session cookie
 * proxy.ts checks on every request. Credentials never reach the client:
 * this route reads them from process.env, not from anything the browser
 * could inspect.
 */
export async function POST(request: Request) {
  const configuredUsername = process.env.AUTH_USERNAME;
  const configuredPassword = process.env.AUTH_PASSWORD;

  if (!configuredUsername || !configuredPassword) {
    return NextResponse.json(
      { error: "Server auth is not configured." },
      { status: 500 },
    );
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  const valid =
    safeEqual(username, configuredUsername) &&
    safeEqual(password, configuredPassword);

  if (!valid) {
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE_NAME,
    createSessionToken(configuredUsername),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  );
  return response;
}
