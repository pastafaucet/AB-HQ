import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";

// Machine endpoints for Claude's connector. Each does its own auth (bearer
// tokens, PKCE); the consent page /oauth/authorize stays behind the passcode.
const PUBLIC_PATHS = ["/api/mcp", "/oauth/token", "/oauth/register"];
const PUBLIC_PREFIXES = ["/.well-known/oauth-"];

// The front door: every app route requires a valid session cookie.
// /login is the only page reachable while logged out.
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = secret ? await verifySession(secret, token) : false;

  const isLogin = path === "/login";

  if (!authed && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Bring Andy back where he was headed (e.g. Claude's connect screen).
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (authed && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
