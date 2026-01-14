import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@vercel/postgres";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не сте влезли в системата" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { company, billingCompany, useSameForBilling } = body;

    // Validate company data
    if (!company?.companyName || !company?.eik || !company?.address || !company?.napStoreNumber) {
      return NextResponse.json({ error: "Моля попълнете всички задължителни полета" }, { status: 400 });
    }

    if (company.eik.length !== 9) {
      return NextResponse.json({ error: "ЕИК трябва да е 9 цифри" }, { status: 400 });
    }

    // Validate billing company if different
    if (!useSameForBilling) {
      if (!billingCompany?.companyName || !billingCompany?.eik || !billingCompany?.address) {
        return NextResponse.json({ error: "Моля попълнете данните за фактуриране" }, { status: 400 });
      }
      if (billingCompany.eik.length !== 9) {
        return NextResponse.json({ error: "ЕИК за фактуриране трябва да е 9 цифри" }, { status: 400 });
      }
    }

    // Get user's business
    const businessResult = await sql`
      SELECT b.id FROM businesses b
      JOIN business_users bu ON bu.business_id = b.id
      WHERE bu.user_id = ${userId}
      LIMIT 1
    `;

    if (businessResult.rows.length === 0) {
      return NextResponse.json({ error: "Нямате свързан бизнес" }, { status: 400 });
    }

    const businessId = businessResult.rows[0].id;

    // Get user's store connection
    const storeResult = await sql`
      SELECT site_id, instance_id, store_name FROM store_connections
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    if (storeResult.rows.length === 0) {
      return NextResponse.json({
        error: "Нямате свързан магазин. Моля първо инсталирайте UDITO от Wix App Market.",
      }, { status: 400 });
    }

    const { site_id: siteId, instance_id: instanceId, store_name: storeName } = storeResult.rows[0];

    // Upsert company data (for receipts)
    await sql`
      INSERT INTO companies (
        site_id, instance_id, store_name, bulstat, vat_number, address_line1, city, postal_code, mol, store_id
      ) VALUES (
        ${siteId}, ${instanceId}, ${company.companyName}, ${company.eik}, ${company.vatNumber || null},
        ${company.address}, ${company.city || null}, ${company.postalCode || null}, ${company.mol || null},
        ${company.napStoreNumber}
      )
      ON CONFLICT (site_id) DO UPDATE SET
        store_name = EXCLUDED.store_name,
        bulstat = EXCLUDED.bulstat,
        vat_number = EXCLUDED.vat_number,
        address_line1 = EXCLUDED.address_line1,
        city = EXCLUDED.city,
        postal_code = EXCLUDED.postal_code,
        mol = EXCLUDED.mol,
        store_id = EXCLUDED.store_id,
        updated_at = NOW()
    `;

    // Upsert billing company
    if (useSameForBilling) {
      // Use same company for billing
      await sql`
        INSERT INTO billing_companies (
          id, business_id, company_name, eik, vat_number, address, city, postal_code, mol, use_same_as_store
        ) VALUES (
          gen_random_uuid(), ${businessId}, ${company.companyName}, ${company.eik}, ${company.vatNumber || null},
          ${company.address}, ${company.city || null}, ${company.postalCode || null}, ${company.mol || null}, true
        )
        ON CONFLICT (business_id) DO UPDATE SET
          company_name = EXCLUDED.company_name,
          eik = EXCLUDED.eik,
          vat_number = EXCLUDED.vat_number,
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          postal_code = EXCLUDED.postal_code,
          mol = EXCLUDED.mol,
          use_same_as_store = true,
          updated_at = NOW()
      `;
    } else {
      // Use different company for billing
      await sql`
        INSERT INTO billing_companies (
          id, business_id, company_name, eik, vat_number, address, city, postal_code, mol, use_same_as_store
        ) VALUES (
          gen_random_uuid(), ${businessId}, ${billingCompany.companyName}, ${billingCompany.eik},
          ${billingCompany.vatNumber || null}, ${billingCompany.address}, ${billingCompany.city || null},
          ${billingCompany.postalCode || null}, ${billingCompany.mol || null}, false
        )
        ON CONFLICT (business_id) DO UPDATE SET
          company_name = EXCLUDED.company_name,
          eik = EXCLUDED.eik,
          vat_number = EXCLUDED.vat_number,
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          postal_code = EXCLUDED.postal_code,
          mol = EXCLUDED.mol,
          use_same_as_store = false,
          updated_at = NOW()
      `;
    }

    // Update onboarding step
    await sql`
      UPDATE businesses
      SET onboarding_step = GREATEST(onboarding_step, 1), updated_at = NOW()
      WHERE id = ${businessId}
    `;

    return NextResponse.json({ ok: true, message: "Данните са запазени" });
  } catch (error) {
    console.error("Onboarding company error:", error);
    return NextResponse.json({ error: "Възникна грешка при запис" }, { status: 500 });
  }
}
