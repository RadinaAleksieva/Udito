import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

let lastWebhooks: any[] = [];

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const timestamp = new Date().toISOString();

  // Store last 10 webhooks
  lastWebhooks.unshift({
    timestamp,
    body: rawBody.substring(0, 2000), // First 2000 chars
    headers: Object.fromEntries(request.headers.entries()),
  });

  if (lastWebhooks.length > 10) {
    lastWebhooks = lastWebhooks.slice(0, 10);
  }

  return NextResponse.json({ ok: true, stored: true });
}

export async function GET() {
  return NextResponse.json({
    count: lastWebhooks.length,
    webhooks: lastWebhooks,
  });
}
