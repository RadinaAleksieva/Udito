import { NextResponse } from "next/server";
import { initDb, upsertOrder } from "@/lib/db";
import { pickOrderFields, queryPaidOrders } from "@/lib/wix";

function requireSecret(request: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SECRET is not configured.");
  }
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    throw new Error("Unauthorized.");
  }
}

function resolveStartDateIso() {
  const iso = process.env.BACKFILL_START_ISO;
  const date = process.env.BACKFILL_START_DATE;
  const timezone = process.env.TIMEZONE || "Europe/Sofia";

  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }
  }

  if (date) {
    const fallbackIso = `${date}T00:00:00+03:00`;
    const parsed = new Date(fallbackIso);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }
  }

  const now = new Date();
  console.warn(
    "BACKFILL_START_DATE/ISO missing; defaulting to last 30 days.",
    { timezone }
  );
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return last30.toISOString();
}

export async function POST(request: Request) {
  try {
    requireSecret(request);
    await initDb();

    const startDateIso = resolveStartDateIso();
    const limit = Number(process.env.BACKFILL_PAGE_LIMIT || 100);
    const maxPages = Number(process.env.BACKFILL_MAX_PAGES || 50);

    let cursor: string | null = null;
    let total = 0;
    let pages = 0;

    do {
      const page = await queryPaidOrders({ startDateIso, cursor, limit });
      const orders = page.orders || [];
      for (const raw of orders) {
        const mapped = pickOrderFields(raw, "backfill");
        if (!mapped.id) {
          continue;
        }
        await upsertOrder(mapped);
        total += 1;
      }
      cursor = page.cursor ?? null;
      pages += 1;
    } while (cursor && pages < maxPages);

    return NextResponse.json({
      ok: true,
      total,
      pages,
      startDateIso,
      cursor: cursor ?? null,
    });
  } catch (error) {
    console.error("Backfill failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
