import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await initDb();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { storeId } = body;

    if (!storeId) {
      return NextResponse.json({ ok: false, error: "Missing storeId" }, { status: 400 });
    }

    // Verify the store belongs to the user and delete it
    const result = await sql`
      DELETE FROM store_connections
      WHERE id = ${storeId} AND user_id = ${session.user.id}
      RETURNING id
    `;

    if (result.rowCount === 0) {
      return NextResponse.json({ ok: false, error: "Store not found or access denied" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Store delete error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
