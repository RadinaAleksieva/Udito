import { NextRequest, NextResponse } from "next/server";
import { getActiveStore } from "@/lib/auth";
import sizeOf from "image-size";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Local storage directory for uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/www/udito-app/public/uploads";
const PUBLIC_URL_BASE = process.env.PUBLIC_URL_BASE || "/uploads";

export async function POST(request: NextRequest) {
  try {
    const store = await getActiveStore();
    const storeId = store?.instanceId || store?.siteId;

    if (!storeId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type - only PNG and JPG (SVG not supported by PDF renderer)
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({
        error: "Само PNG и JPG формати са позволени (SVG не се поддържа)"
      }, { status: 400 });
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
    }

    // Get image dimensions
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const dimensions = sizeOf(buffer);

    const width = dimensions.width || 100;
    const height = dimensions.height || 100;

    // Generate unique filename
    const ext = path.extname(file.name) || ".png";
    const randomSuffix = crypto.randomBytes(8).toString("hex");
    const filename = `logo-${storeId}-${randomSuffix}${ext}`;

    // Ensure upload directory exists
    const logoDir = path.join(UPLOAD_DIR, "logos");
    await fs.mkdir(logoDir, { recursive: true });

    // Save file locally
    const filePath = path.join(logoDir, filename);
    await fs.writeFile(filePath, buffer);

    // Return public URL
    const url = `${PUBLIC_URL_BASE}/logos/${filename}`;

    return NextResponse.json({
      url,
      width,
      height,
    });
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
    const store = await getActiveStore();
    const storeId = store?.instanceId || store?.siteId;

    if (!storeId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "No URL provided" }, { status: 400 });
    }

    // Only allow deleting local uploads
    if (!url.startsWith(PUBLIC_URL_BASE)) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // Extract filename from URL
    const filename = path.basename(url);
    const filePath = path.join(UPLOAD_DIR, "logos", filename);

    // Delete file
    try {
      await fs.unlink(filePath);
    } catch (e) {
      // File might not exist, that's ok
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Logo delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete logo" },
      { status: 500 }
    );
  }
}
