import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirect") || "/login";
  const response = NextResponse.redirect(new URL(redirectTo, url.origin));
  response.cookies.set("udito_instance_id", "", { path: "/", maxAge: 0 });
  response.cookies.set("udito_site_id", "", { path: "/", maxAge: 0 });
  return response;
}
