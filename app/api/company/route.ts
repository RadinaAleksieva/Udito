import { NextResponse } from "next/server";
import {
  getCompanyBySite,
  initDb,
  upsertCompany,
} from "@/lib/db";
import { getActiveStore } from "@/lib/auth";

export async function GET() {
  await initDb();
  const store = await getActiveStore();

  if (!store?.siteId && !store?.instanceId) {
    return NextResponse.json(
      { ok: false, error: "Няма свързан магазин." },
      { status: 400 }
    );
  }
  const company = await getCompanyBySite(store.siteId, store.instanceId);
  return NextResponse.json({ ok: true, company });
}

export async function POST(request: Request) {
  await initDb();
  const body = await request.json().catch(() => ({}));
  if (!body?.legalName || !body?.bulstat) {
    return NextResponse.json(
      { ok: false, error: "Моля, попълнете фирма и ЕИК." },
      { status: 400 }
    );
  }
  if (!body?.storeId) {
    return NextResponse.json(
      { ok: false, error: "Липсва уникален код на магазина." },
      { status: 400 }
    );
  }

  const store = await getActiveStore();

  if (!store?.siteId && !store?.instanceId) {
    return NextResponse.json(
      { ok: false, error: "Няма свързан магазин." },
      { status: 400 }
    );
  }

  const { siteId, instanceId } = store;

  const profile = {
    businessId: null,
    siteId: siteId || `temp-${instanceId}`,
    instanceId,
    storeName: body?.storeName ?? null,
    storeDomain: body?.storeDomain ?? null,
    legalName: body?.legalName ?? null,
    vatNumber: body?.vatNumber ?? null,
    bulstat: body?.bulstat ?? null,
    storeId: body?.storeId ?? null,
    logoUrl: body?.logoUrl ?? null,
    logoWidth: body?.logoWidth ?? null,
    logoHeight: body?.logoHeight ?? null,
    addressLine1: body?.addressLine1 ?? null,
    addressLine2: body?.addressLine2 ?? null,
    city: body?.city ?? null,
    postalCode: body?.postalCode ?? null,
    country: body?.country ?? null,
    email: body?.email ?? null,
    phone: body?.phone ?? null,
    iban: body?.iban ?? null,
    bankName: body?.bankName ?? null,
    mol: body?.mol ?? null,
    receiptTemplate: body?.receiptTemplate ?? null,
  };

  await upsertCompany(profile);
  const company = await getCompanyBySite(siteId, instanceId);
  return NextResponse.json({ ok: true, company });
}
