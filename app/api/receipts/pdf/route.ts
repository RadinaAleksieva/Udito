import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function getBrowser() {
  // In production (Vercel), use @sparticuz/chromium
  // In development, use local Chrome
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // Try common Chrome paths for local development
    const possiblePaths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ];

    let executablePath = null;
    for (const path of possiblePaths) {
      try {
        const fs = await import("fs");
        if (fs.existsSync(path)) {
          executablePath = path;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!executablePath) {
      throw new Error("Chrome not found. Please install Google Chrome for local PDF generation.");
    }

    return puppeteer.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  // Production: use @sparticuz/chromium
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1200, height: 800 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");
  const type = searchParams.get("type") || "sale";

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  let browser = null;

  try {
    browser = await getBrowser();
    const page = await browser.newPage();

    // Get the base URL from the request
    const protocol = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("host") || "localhost:3000";
    const baseUrl = `${protocol}://${host}`;

    // Forward cookies for authentication
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      const cookies = cookieHeader.split(";").map((cookie) => {
        const [name, ...valueParts] = cookie.trim().split("=");
        return {
          name: name.trim(),
          value: valueParts.join("="),
          domain: host.split(":")[0],
          path: "/",
        };
      });
      await page.setCookie(...cookies);
    }

    // Navigate to the receipt page
    const receiptUrl = `${baseUrl}/receipts/${orderId}?type=${type}`;
    await page.goto(receiptUrl, {
      waitUntil: "networkidle0",
      timeout: 20000,
    });

    // Wait for content to load
    await page.waitForSelector(".receipt", { timeout: 10000 });

    // Hide the action buttons for PDF
    await page.evaluate(() => {
      const actions = document.querySelector(".receipt-actions");
      if (actions) {
        (actions as HTMLElement).style.display = "none";
      }
    });

    // Generate PDF
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "10mm",
        right: "10mm",
        bottom: "10mm",
        left: "10mm",
      },
    });

    await browser.close();

    // Create filename
    const filename = `receipt-${orderId}-${type}.pdf`;

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    if (browser) {
      await browser.close();
    }
    return NextResponse.json(
      { error: "Failed to generate PDF", details: String(error) },
      { status: 500 }
    );
  }
}
