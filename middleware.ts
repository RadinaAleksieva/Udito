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
];

// Routes that are always public (use exact match for "/" to avoid matching everything)
const publicPrefixes = [
  "/login",
  "/register",
  "/help",
  "/privacy-policy",
  "/policies",
  "/api/auth",
  "/api/wix",
  "/api/contact",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow exact match for home page
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Allow public routes by prefix
  for (const prefix of publicPrefixes) {
    if (pathname.startsWith(prefix)) {
      return NextResponse.next();
    }
  }

  // Allow most API routes (except protected ones)
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/audit")) {
    return NextResponse.next();
  }

  // Check if route requires authentication
  let requiresAuth = false;
  for (const route of protectedRoutes) {
    if (pathname.startsWith(route)) {
      requiresAuth = true;
      break;
    }
  }

  // If route doesn't require auth, allow it
  if (!requiresAuth) {
    return NextResponse.next();
  }

  // Route requires authentication - check for valid session

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

  // Check for Wix instance cookies (legacy auth)
  const uditoInstanceId = request.cookies.get("udito_instance_id");
  const uditoSiteId = request.cookies.get("udito_site_id");

  // Allow if user has valid NextAuth token with id
  if (token && token.id) {
    return NextResponse.next();
  }

  // Allow if user has Wix instance cookies
  if (uditoInstanceId || uditoSiteId) {
    return NextResponse.next();
  }

  // No valid authentication - redirect to login
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", pathname);

  // Preserve Wix params so they can be captured after login
  const wixParams = ["instance", "instanceId", "instance_id", "siteId", "site_id", "appInstanceId"];
  for (const param of wixParams) {
    const value = request.nextUrl.searchParams.get(param);
    if (value) {
      loginUrl.searchParams.set(param, value);
    }
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Match all routes except static files and images
    "/((?!_next/static|_next/image|favicon.ico|brand|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
  ],
};
