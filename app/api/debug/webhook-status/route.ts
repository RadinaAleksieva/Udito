import { NextResponse } from "next/server";

const APP_ID = process.env.WIX_APP_ID || "";
const APP_PUBLIC_KEY = process.env.WIX_APP_PUBLIC_KEY || "";

export async function GET() {
  return NextResponse.json({
    hasAppId: !!APP_ID,
    hasPublicKey: !!APP_PUBLIC_KEY,
    appIdLength: APP_ID.length,
    publicKeyLength: APP_PUBLIC_KEY.length,
    webhookEndpoint: "https://udito.vercel.app/api/webhooks/wix/orders",
  });
}
