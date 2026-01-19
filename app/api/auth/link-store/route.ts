import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/lib/sql";
import { auth, linkStoreToUser } from "@/lib/auth";

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const jar = cookies();
  const siteId = jar.get("udito_site_id")?.value ?? null;
  const instanceId = jar.get("udito_instance_id")?.value ?? null;

  if (!siteId && !instanceId) {
    return NextResponse.json({ ok: false, error: "No Wix cookies found" }, { status: 400 });
  }

  try {
    await linkStoreToUser(session.user.id, siteId || "", instanceId || undefined);

    return NextResponse.json({
      ok: true,
      message: "Store linked successfully",
      siteId,
      instanceId
    });
  } catch (error) {
    console.error("Error linking store:", error);
    return NextResponse.json({ ok: false, error: "Failed to link store" }, { status: 500 });
  }
}

// GET endpoint to check current linking status
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const jar = cookies();
  const siteId = jar.get("udito_site_id")?.value ?? null;
  const instanceId = jar.get("udito_instance_id")?.value ?? null;

  // Get user's existing store connections
  const stores = await sql`
    SELECT sc.*, c.store_name, c.store_domain
    FROM store_connections sc
    LEFT JOIN companies c ON c.site_id = sc.site_id
    WHERE sc.user_id = ${session.user.id}
  `;

  return NextResponse.json({
    ok: true,
    user: { id: session.user.id, email: session.user.email },
    cookies: { siteId, instanceId },
    linkedStores: stores.rows
  });
}
