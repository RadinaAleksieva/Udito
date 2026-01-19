import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, linkStoreToUser } from "@/lib/auth";
import { sql } from "@/lib/sql";
import { createTenantTables, getSchemaForSite, tenantTablesExist } from "@/lib/tenant-db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Не сте влезли" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { siteId } = body;

    if (!siteId) {
      return NextResponse.json({ ok: false, error: "Липсва siteId" }, { status: 400 });
    }

    // SECURITY: Check if this store is already linked to ANOTHER user
    const existingOwner = await sql`
      SELECT user_id, u.email as owner_email
      FROM store_connections sc
      LEFT JOIN users u ON u.id = sc.user_id
      WHERE sc.site_id = ${siteId} AND sc.user_id IS NOT NULL AND sc.user_id != ${session.user.id}
      LIMIT 1
    `;

    if (existingOwner.rows.length > 0) {
      // Store is already owned by someone else!
      console.error(`SECURITY: User ${session.user.email} tried to link store ${siteId} which belongs to another user`);
      return NextResponse.json(
        { ok: false, error: "Този магазин вече е свързан с друг акаунт" },
        { status: 403 }
      );
    }

    // Check if already linked to this user
    const alreadyLinked = await sql`
      SELECT id FROM store_connections
      WHERE site_id = ${siteId} AND user_id = ${session.user.id}
    `;

    if (alreadyLinked.rows.length > 0) {
      // Already linked to this user - just redirect
      return NextResponse.json({ ok: true, alreadyLinked: true });
    }

    // Ensure tenant tables exist
    const tablesExist = await tenantTablesExist(siteId);
    if (!tablesExist) {
      await createTenantTables(siteId);
    }

    // Link the store to the user
    await linkStoreToUser(session.user.id, siteId);

    console.log(`Store ${siteId} linked to user ${session.user.email} after explicit confirmation`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error linking store:", error);
    return NextResponse.json(
      { ok: false, error: "Грешка при добавяне на магазина" },
      { status: 500 }
    );
  }
}
