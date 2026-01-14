import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Subdomain configuration
const APP_SUBDOMAIN = "app"; // app.udito.vercel.app or app-udito.vercel.app
const LANDING_HOSTS = ["localhost", "udito.vercel.app", "udito-landing.vercel.app", "udito.bg"];

// Routes only available on APP subdomain (require auth)
const appOnlyRoutes = [
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

// Routes only available on LANDING subdomain (public)
const landingOnlyRoutes = [
  "/",
  "/register",
  "/help",
  "/privacy-policy",
  "/policies",
];

// Routes available on both (auth-related)
const sharedRoutes = [
  "/login",
  "/api",
];

function isAppSubdomain(host: string): boolean {
  // Check for patterns like "app.udito.vercel.app", "app-udito.vercel.app", "app.localhost"
  const lowerHost = host.toLowerCase();
  return lowerHost.startsWith(`${APP_SUBDOMAIN}.`) ||
         lowerHost.startsWith(`${APP_SUBDOMAIN}-`) ||
         lowerHost.includes(`-${APP_SUBDOMAIN}.`);
}

function isLandingHost(host: string): boolean {
  const lowerHost = host.toLowerCase().split(":")[0]; // Remove port
  return LANDING_HOSTS.some(h => lowerHost === h || lowerHost.endsWith(`.${h}`));
}

function getAppUrl(request: NextRequest, pathname: string): URL {
  const host = request.headers.get("host") || "";
  // Transform landing host to app host
  // e.g., udito.vercel.app -> app-udito.vercel.app
  // or localhost:3000 -> app.localhost:3000
  let appHost = host;
  if (host.includes("localhost")) {
    appHost = `${APP_SUBDOMAIN}.${host}`;
  } else if (host.includes("vercel.app")) {
    // udito.vercel.app -> app-udito.vercel.app
    appHost = host.replace(/^([^.]+)(\.vercel\.app)/, `${APP_SUBDOMAIN}-$1$2`);
  }
  const url = new URL(pathname, `${request.nextUrl.protocol}//${appHost}`);
  return url;
}

function getLandingUrl(request: NextRequest, pathname: string): URL {
  const host = request.headers.get("host") || "";
  // Transform app host to landing host
  let landingHost = host;
  if (host.includes("localhost")) {
    landingHost = host.replace(/^app\./, "");
  } else if (host.includes("vercel.app")) {
    // app-udito.vercel.app -> udito.vercel.app
    landingHost = host.replace(/^app-/, "");
  }
  const url = new URL(pathname, `${request.nextUrl.protocol}//${landingHost}`);
  return url;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";

  const isApp = isAppSubdomain(host);
  const isLanding = !isApp; // If not app subdomain, treat as landing

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

  // Allow API routes on both subdomains
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Allow static assets
  if (pathname.startsWith("/_next/") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // === APP SUBDOMAIN LOGIC ===
  if (isApp) {
    // On app subdomain, check if route is landing-only
    const isLandingRoute = landingOnlyRoutes.some(route =>
      route === "/" ? pathname === "/" : pathname.startsWith(route)
    );

    if (isLandingRoute && pathname !== "/") {
      // Redirect landing-only routes to landing subdomain
      return NextResponse.redirect(getLandingUrl(request, pathname));
    }

    // Home page on app subdomain redirects to overview if authenticated
    if (pathname === "/") {
      if (isAuthenticated) {
        return NextResponse.redirect(new URL("/overview", request.url));
      } else {
        // Not authenticated on app subdomain home -> go to landing login
        return NextResponse.redirect(getLandingUrl(request, "/login"));
      }
    }

    // App routes require authentication
    const isAppRoute = appOnlyRoutes.some(route => pathname.startsWith(route));
    if (isAppRoute && !isAuthenticated) {
      // Redirect to landing subdomain login
      const loginUrl = getLandingUrl(request, "/login");
      loginUrl.searchParams.set("callbackUrl", request.url);

      // Preserve Wix params
      const wixParams = ["instance", "instanceId", "instance_id", "siteId", "site_id"];
      for (const param of wixParams) {
        const value = request.nextUrl.searchParams.get(param);
        if (value) loginUrl.searchParams.set(param, value);
      }

      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // === LANDING SUBDOMAIN LOGIC ===
  if (isLanding) {
    // Check if trying to access app-only routes
    const isAppRoute = appOnlyRoutes.some(route => pathname.startsWith(route));

    if (isAppRoute) {
      if (isAuthenticated) {
        // Authenticated user accessing app route on landing -> redirect to app subdomain
        const appUrl = getAppUrl(request, pathname);
        // Preserve query params
        request.nextUrl.searchParams.forEach((value, key) => {
          appUrl.searchParams.set(key, value);
        });
        return NextResponse.redirect(appUrl);
      } else {
        // Not authenticated -> redirect to login
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
      }
    }

    // Authenticated user on landing home -> redirect to app
    if (pathname === "/" && isAuthenticated) {
      return NextResponse.redirect(getAppUrl(request, "/overview"));
    }

    // Login page: if already authenticated, redirect to app
    if (pathname === "/login" && isAuthenticated) {
      const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");
      if (callbackUrl) {
        // If callback is an app route, redirect to app subdomain
        const isCallbackAppRoute = appOnlyRoutes.some(route => callbackUrl.startsWith(route));
        if (isCallbackAppRoute) {
          return NextResponse.redirect(getAppUrl(request, callbackUrl));
        }
      }
      return NextResponse.redirect(getAppUrl(request, "/overview"));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and images
    "/((?!_next/static|_next/image|favicon.ico|brand|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
  ],
};
