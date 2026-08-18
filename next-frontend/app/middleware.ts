// middleware.ts (at project root)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/app")) return NextResponse.next();

  // ✅ Only presence check — no decoding needed here
  const hasToken = req.cookies.has("token");
  if (!hasToken) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = ""; // drop query
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
