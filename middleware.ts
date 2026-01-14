import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Routes that require authentication
const protectedRoutes = [
  "/overview",
  "/orders",
  "/receipts",
  "/reports",
  "/audit",
  "/settings",
  "/debug",
  "/onboarding",
  "/billing",
];

// Public routes (no auth required)
const publicRoutes = [
  "/",
  "/login",
  "/register",
  "/help",
  "/privacy-policy",
  "/policies",
  "/access",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow API routes
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Allow static assets
  if (pathname.startsWith("/_next/") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // Check for NextAuth JWT token
  let token = null;
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
  } catch {
    // Token parsing failed
  }

  // Check for Wix instance cookies/params (legacy auth)
  const hasWixAuth =
    request.cookies.get("udito_instance_id") ||
    request.cookies.get("udito_site_id") ||
    request.nextUrl.searchParams.get("instanceId") ||
    request.nextUrl.searchParams.get("instance_id") ||
    request.nextUrl.searchParams.get("siteId") ||
    request.nextUrl.searchParams.get("instance");

  const isAuthenticated = !!(token?.id || hasWixAuth);

  // Check if route is protected
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  const isPublicRoute = publicRoutes.some(route =>
    route === "/" ? pathname === "/" : pathname.startsWith(route)
  );

  // Protected routes require authentication
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);

    // Preserve Wix params
    const wixParams = ["instance", "instanceId", "instance_id", "siteId", "site_id"];
    for (const param of wixParams) {
      const value = request.nextUrl.searchParams.get(param);
      if (value) loginUrl.searchParams.set(param, value);
    }

    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user on home page -> redirect to overview
  if (pathname === "/" && isAuthenticated) {
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  // Authenticated user on login page -> redirect to overview or callback
  if (pathname === "/login" && isAuthenticated) {
    const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");
    if (callbackUrl && protectedRoutes.some(route => callbackUrl.startsWith(route))) {
      return NextResponse.redirect(new URL(callbackUrl, request.url));
    }
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and images
    "/((?!_next/static|_next/image|favicon.ico|brand|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
  ],
};
