import { NextResponse } from "next/server";
import { initDb, listSyncSites } from "@/lib/db";

export async function GET() {
  try {
    await initDb();
    const sites = await listSyncSites(50);
    return NextResponse.json({ ok: true, sites });
  } catch (error) {
    console.error("Auto sync discovery failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
