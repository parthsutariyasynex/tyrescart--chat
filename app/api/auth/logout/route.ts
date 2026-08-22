import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/services/session";

/** Clears the session cookie. proxy.ts re-validates on every subsequent
 * request, so anything protected redirects to /login immediately after. */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
