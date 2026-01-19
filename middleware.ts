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
  "/admin",
];

// Public routes (no auth required)
const publicRoutes = [
  "/",
  "/login",
  "/register",
  "/add-store",
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
  let tokenError = false;
  try {
    token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
  } catch {
    // Token parsing failed - need to clear invalid cookies
    tokenError = true;
  }

  // If token parsing failed, clear cookies and redirect to login
  if (tokenError) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    // Clear all auth cookies
    response.cookies.delete("next-auth.session-token");
    response.cookies.delete("__Secure-next-auth.session-token");
    response.cookies.delete("next-auth.csrf-token");
    response.cookies.delete("__Host-next-auth.csrf-token");
    response.cookies.delete("next-auth.callback-url");
    response.cookies.delete("__Secure-next-auth.callback-url");
    return response;
  }

  // Check for Wix instance cookies/params (for store identification)
  const hasWixParams =
    request.cookies.get("udito_instance_id") ||
    request.cookies.get("udito_site_id") ||
    request.nextUrl.searchParams.get("instanceId") ||
    request.nextUrl.searchParams.get("instance_id") ||
    request.nextUrl.searchParams.get("siteId") ||
    request.nextUrl.searchParams.get("instance");

  // Full authentication requires NextAuth session
  const isFullyAuthenticated = !!token?.id;

  // Legacy auth: allow access with Wix params for backward compatibility
  const hasLegacyAuth = !!hasWixParams;

  // Check if route is protected
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  const isPublicRoute = publicRoutes.some(route =>
    route === "/" ? pathname === "/" : pathname.startsWith(route)
  );

  // Protected routes require authentication (NextAuth or legacy Wix)
  if (isProtectedRoute && !isFullyAuthenticated && !hasLegacyAuth) {
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

  // SECURITY: Check if Wix is trying to open a DIFFERENT store than user's current one
  // This happens when user installs app on a new site while already logged in
  let wixInstanceId = request.nextUrl.searchParams.get("instance") ||
                      request.nextUrl.searchParams.get("instanceId") ||
                      request.nextUrl.searchParams.get("instance_id");
  let wixSiteId = request.nextUrl.searchParams.get("siteId") ||
                  request.nextUrl.searchParams.get("site_id");

  // Wix sometimes sends a JWT token instead of plain instance ID
  const wixToken = request.nextUrl.searchParams.get("token");
  if (wixToken && !wixInstanceId) {
    try {
      // Decode JWT without verification (we just need the instanceId)
      const parts = wixToken.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        wixInstanceId = payload.instanceId || payload.data?.instanceId || null;
        wixSiteId = payload.siteId || payload.data?.siteId || wixSiteId;
        console.log(`[Middleware] Decoded Wix token: instanceId=${wixInstanceId}, siteId=${wixSiteId}`);
      }
    } catch (e) {
      // Not a JWT, might be a hex token - try to use it as instance ID
      console.log(`[Middleware] Wix token is not JWT, using as instance ID`);
      wixInstanceId = wixToken;
    }
  }

  const currentSiteId = request.cookies.get("udito_site_id")?.value;

  // If Wix is sending us to a NEW site (different from cookie), redirect to add-store
  if (isFullyAuthenticated && (wixInstanceId || wixSiteId)) {
    const incomingSiteId = wixSiteId || wixInstanceId;
    if (incomingSiteId && incomingSiteId !== currentSiteId) {
      console.log(`[Middleware] New Wix site detected: ${incomingSiteId} (current: ${currentSiteId})`);
      const addStoreUrl = new URL("/add-store", request.url);
      addStoreUrl.searchParams.set("store", incomingSiteId);
      return NextResponse.redirect(addStoreUrl);
    }
  }

  // Only fully authenticated users get redirected from home page
  // (Users with just Wix params should see landing page and be prompted to login)
  if (pathname === "/" && isFullyAuthenticated) {
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  // Only fully authenticated users get redirected from login page
  if (pathname === "/login" && isFullyAuthenticated) {
    const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");
    if (callbackUrl && protectedRoutes.some(route => callbackUrl.startsWith(route))) {
      return NextResponse.redirect(new URL(callbackUrl, request.url));
    }
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  // SECURITY: If authenticated user tries to access /register with Wix params,
  // redirect to /add-store for EXPLICIT confirmation (prevent auto-linking attack)
  if (pathname === "/register" && isFullyAuthenticated) {
    const fromWix = request.nextUrl.searchParams.get("from") === "wix";
    const storeId = request.nextUrl.searchParams.get("store");
    if (fromWix && storeId) {
      // Redirect to confirmation page - DO NOT auto-link stores!
      const addStoreUrl = new URL("/add-store", request.url);
      addStoreUrl.searchParams.set("store", storeId);
      return NextResponse.redirect(addStoreUrl);
    }
    // If already authenticated without Wix context, go to overview
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
