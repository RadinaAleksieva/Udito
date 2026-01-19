import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirect");

  // Clear cookies
  const response = redirectTo
    ? NextResponse.redirect(new URL(redirectTo, url.origin))
    : NextResponse.json({ ok: true });

  response.cookies.set("udito_instance_id", "", { path: "/", maxAge: 0 });
  response.cookies.set("udito_site_id", "", { path: "/", maxAge: 0 });
  return response;
}

export async function POST() {
  // POST version for fetch calls - just clear cookies, no redirect
  const response = NextResponse.json({ ok: true });
  response.cookies.set("udito_instance_id", "", { path: "/", maxAge: 0 });
  response.cookies.set("udito_site_id", "", { path: "/", maxAge: 0 });
  return response;
}
