import { NextResponse } from "next/server";
import { auth, linkStoreToUser } from "@/lib/auth";
import { initDb, sql } from "@/lib/db";
import { getAppInstanceDetails } from "@/lib/wix";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await initDb();

  // Check if user is authenticated
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Трябва да сте влезли в акаунта си" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { instanceId } = body;

    if (!instanceId || typeof instanceId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Instance ID е задължително" },
        { status: 400 }
      );
    }

    const trimmedInstanceId = instanceId.trim();

    // Check if this store connection already exists for this user
    const existing = await sql`
      SELECT id FROM store_connections
      WHERE user_id = ${session.user.id}
      AND (instance_id = ${trimmedInstanceId} OR site_id = ${trimmedInstanceId})
    `;

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Този магазин вече е свързан с вашия акаунт" },
        { status: 400 }
      );
    }

    // Try to find an existing store_connection or wix_tokens entry with this instance_id
    // This validates that the instance_id is real
    const existingStore = await sql`
      SELECT site_id, instance_id FROM store_connections
      WHERE instance_id = ${trimmedInstanceId} OR site_id = ${trimmedInstanceId}
      LIMIT 1
    `;

    let siteId: string | null = null;
    let finalInstanceId: string = trimmedInstanceId;

    if (existingStore.rows.length > 0) {
      // Store exists, use its site_id
      siteId = existingStore.rows[0].site_id;
      finalInstanceId = existingStore.rows[0].instance_id || trimmedInstanceId;
    } else {
      // Check wix_tokens table
      const tokenEntry = await sql`
        SELECT site_id, instance_id FROM wix_tokens
        WHERE instance_id = ${trimmedInstanceId} OR site_id = ${trimmedInstanceId}
        LIMIT 1
      `;

      if (tokenEntry.rows.length > 0) {
        siteId = tokenEntry.rows[0].site_id;
        finalInstanceId = tokenEntry.rows[0].instance_id || trimmedInstanceId;
      } else {
        // No existing record - call Wix API to get the real siteId
        try {
          const appInstance = await getAppInstanceDetails({ instanceId: trimmedInstanceId });
          if (appInstance?.siteId) {
            siteId = appInstance.siteId;
            console.log(`✅ Got siteId from Wix API: ${siteId} for instanceId: ${trimmedInstanceId}`);
          } else {
            // API didn't return siteId, use instanceId as fallback
            siteId = trimmedInstanceId;
            console.log(`⚠️ Wix API didn't return siteId, using instanceId as fallback`);
          }
        } catch (apiError) {
          console.error("Failed to get siteId from Wix API:", apiError);
          // Fallback to instanceId if API fails
          siteId = trimmedInstanceId;
        }
      }
    }

    // Link the store to the user
    await linkStoreToUser(session.user.id, siteId || trimmedInstanceId, finalInstanceId);

    return NextResponse.json({
      ok: true,
      message: "Магазинът е свързан успешно",
      store: {
        siteId: siteId || trimmedInstanceId,
        instanceId: finalInstanceId,
      },
    });
  } catch (error: any) {
    console.error("Error connecting store:", error);

    // Handle unique constraint violation
    if (error?.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "Този магазин вече е свързан с вашия акаунт" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "Грешка при свързване на магазина" },
      { status: 500 }
    );
  }
}
