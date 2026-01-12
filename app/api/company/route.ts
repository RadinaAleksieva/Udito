import { NextResponse } from "next/server";
import {
  getCompanyBySite,
  initDb,
  upsertCompany,
} from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";

export async function GET() {
  await initDb();
  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;
  if (!siteId) {
    return NextResponse.json(
      { ok: false, error: "Missing Wix site id." },
      { status: 400 }
    );
  }
  const company = await getCompanyBySite(siteId);
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
  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;
  const instanceId = token?.instance_id ?? null;
  if (!siteId) {
    return NextResponse.json(
      { ok: false, error: "Missing Wix site id." },
      { status: 400 }
    );
  }

  const profile = {
    businessId: null,
    siteId,
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
  const company = await getCompanyBySite(siteId);
  return NextResponse.json({ ok: true, company });
}
