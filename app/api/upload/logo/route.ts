import { put, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getActiveWixToken } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const token = await getActiveWixToken();
    const siteId = token?.site_id;

    if (!siteId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
    }

    // Upload to Vercel Blob with site-specific path
    const blob = await put(`logos/${siteId}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true, // Prevent caching issues
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Logo upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload logo" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = await getActiveWixToken();
    const siteId = token?.site_id;

    if (!siteId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "No URL provided" }, { status: 400 });
    }

    // Only allow deleting logos from our blob storage
    if (!url.includes("vercel-storage.com") && !url.includes("blob.vercel-storage.com")) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    await del(url);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Logo delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete logo" },
      { status: 500 }
    );
  }
}
