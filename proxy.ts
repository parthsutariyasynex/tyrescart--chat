import { NextResponse, type NextRequest } from "next/server";
import { features, NAV_FEATURE_MAP, getDefaultRoute } from "@/config/features";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/services/session";

/**
 * Resolves where a blocked request should land: the same
 * `getDefaultRoute()` the root page already uses (dashboard first, then the
 * first other enabled page), but re-verified so an edge case where EVERY
 * page flag is off can't bounce back into a redirect loop against a target
 * that turns out to be disabled too — /login is the explicitly sanctioned
 * last resort for that case.
 */
function resolveFallback(): string {
  const target = getDefaultRoute();
  const key = NAV_FEATURE_MAP[target];
  if (!key || features[key]) return target;
  return "/login";
}

/** Longest-prefix match against NAV_FEATURE_MAP — same map Sidebar.tsx
 * already filters its nav items with, so a route's protection here can
 * never drift out of sync with whether its nav link is shown. */
function featureKeyForPath(pathname: string) {
  for (const href of Object.keys(NAV_FEATURE_MAP)) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      return NAV_FEATURE_MAP[href];
    }
  }
  return undefined;
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const isAuthenticated = verifySessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  if (!isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const flagKey = featureKeyForPath(pathname);
  if (flagKey && !features[flagKey]) {
    return NextResponse.redirect(new URL(resolveFallback(), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico|css|js|map|woff2?)$).*)",
  ],
};
