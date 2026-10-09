import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSiteGateEnabled, SITE_GATE_COOKIE } from "@/lib/site-gate/config";
import { validateSiteGateTokenEdge } from "@/lib/site-gate/edge";

const PUBLIC_PATH_PREFIXES = [
  "/gate",
  "/api/site-gate",
  "/api/webhooks/",
  "/api/cron/",
];

function isPublicPath(pathname: string): boolean {
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    return true;
  }

  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

export async function middleware(request: NextRequest) {
  if (!isSiteGateEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SITE_GATE_COOKIE)?.value;
  if (await validateSiteGateTokenEdge(token)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/gate";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Run on all routes except static image/font assets in /public root.
     * (public files like embed.js are still matched — gate applies.)
     */
    "/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg)$).*)",
  ],
};
