import { NextResponse } from "next/server";
import { auth, linkStoreToUser } from "@/lib/auth";
import { initDb, sql } from "@/lib/db";

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
    // Check by instance_id first (what user provides), then by site_id
    // NEVER use OR - it can match wrong store!
    let existing = await sql`
      SELECT id FROM store_connections
      WHERE user_id = ${session.user.id}
      AND instance_id = ${trimmedInstanceId}
    `;

    if (existing.rows.length === 0) {
      // Also check if user already connected via site_id
      existing = await sql`
        SELECT id FROM store_connections
        WHERE user_id = ${session.user.id}
        AND site_id = ${trimmedInstanceId}
      `;
    }

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Този магазин вече е свързан с вашия акаунт" },
        { status: 400 }
      );
    }

    // Try to find an existing store_connection or wix_tokens entry
    // Priority: instance_id match first, then site_id
    let existingStore = await sql`
      SELECT site_id, instance_id FROM store_connections
      WHERE instance_id = ${trimmedInstanceId}
      LIMIT 1
    `;

    if (existingStore.rows.length === 0) {
      existingStore = await sql`
        SELECT site_id, instance_id FROM store_connections
        WHERE site_id = ${trimmedInstanceId}
        LIMIT 1
      `;
    }

    let siteId: string | null = null;
    let finalInstanceId: string = trimmedInstanceId;

    if (existingStore.rows.length > 0) {
      // Store exists, use its site_id
      siteId = existingStore.rows[0].site_id;
      finalInstanceId = existingStore.rows[0].instance_id || trimmedInstanceId;
    } else {
      // Check wix_tokens table - priority: instance_id first
      let tokenEntry = await sql`
        SELECT site_id, instance_id FROM wix_tokens
        WHERE instance_id = ${trimmedInstanceId}
        LIMIT 1
      `;

      if (tokenEntry.rows.length === 0) {
        tokenEntry = await sql`
          SELECT site_id, instance_id FROM wix_tokens
          WHERE site_id = ${trimmedInstanceId}
          LIMIT 1
        `;
      }

      if (tokenEntry.rows.length > 0) {
        siteId = tokenEntry.rows[0].site_id;
        finalInstanceId = tokenEntry.rows[0].instance_id || trimmedInstanceId;
      } else {
        // No existing record - the instance_id might be new
        // We'll create a new store_connection with just the instance_id
        // The site_id will be populated when the webhook comes from Wix
        siteId = trimmedInstanceId; // Use instance_id as site_id for now
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
