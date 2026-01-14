import { NextResponse } from "next/server";
import { auth, getUserStores } from "@/lib/auth";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initDb();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated", stores: [] },
        { status: 401 }
      );
    }

    const stores = await getUserStores(session.user.id);

    return NextResponse.json({
      ok: true,
      stores: stores.map((s: any) => ({
        id: s.id,
        site_id: s.site_id,
        instance_id: s.instance_id,
        store_name: s.store_name,
        store_domain: s.store_domain,
      })),
    });
  } catch (error) {
    console.error("Error fetching user stores:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch stores", stores: [] },
      { status: 500 }
    );
  }
}
