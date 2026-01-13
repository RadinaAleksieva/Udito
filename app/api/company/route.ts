import { NextResponse } from "next/server";
import {
  getCompanyBySite,
  initDb,
  upsertCompany,
} from "@/lib/db";
import { getActiveWixToken, getActiveWixContext } from "@/lib/wix-context";
import { auth, getUserStores, linkStoreToUser } from "@/lib/auth";

async function getSiteIdForRequest() {
  // First check if user is logged in via NextAuth
  const session = await auth();

  // Check for Wix cookies
  const wixContext = await getActiveWixContext();
  const cookieSiteId = wixContext.siteId;
  const cookieInstanceId = wixContext.instanceId;

  if (session?.user?.id) {
    let userStores = await getUserStores(session.user.id);

    if (userStores.length > 0) {
      return {
        siteId: userStores[0].site_id || null,
        instanceId: userStores[0].instance_id || null,
      };
    }

    // User has no stores but has Wix cookies - auto link
    if (cookieSiteId || cookieInstanceId) {
      try {
        await linkStoreToUser(session.user.id, cookieSiteId || "", cookieInstanceId || undefined);
        userStores = await getUserStores(session.user.id);
        if (userStores.length > 0) {
          return {
            siteId: userStores[0].site_id || null,
            instanceId: userStores[0].instance_id || null,
          };
        }
      } catch {
        // Fall through to use cookies
      }
      return {
        siteId: cookieSiteId,
        instanceId: cookieInstanceId,
      };
    }

    return { siteId: null, instanceId: null };
  }

  // Fallback to cookie-based auth
  const token = await getActiveWixToken();
  return {
    siteId: token?.site_id ?? null,
    instanceId: token?.instance_id ?? null,
  };
}

export async function GET() {
  await initDb();
  const { siteId, instanceId } = await getSiteIdForRequest();

  if (!siteId && !instanceId) {
    return NextResponse.json(
      { ok: false, error: "Няма свързан магазин." },
      { status: 400 }
    );
  }
  const company = await getCompanyBySite(siteId, instanceId);
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

  const { siteId, instanceId } = await getSiteIdForRequest();

  if (!siteId && !instanceId) {
    return NextResponse.json(
      { ok: false, error: "Няма свързан магазин." },
      { status: 400 }
    );
  }

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
