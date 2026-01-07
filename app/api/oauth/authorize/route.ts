import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appBaseUrl = process.env.APP_BASE_URL || url.origin;
  return NextResponse.redirect(`${appBaseUrl}/overview?oauth=disabled`);
}
