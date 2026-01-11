import { NextResponse } from "next/server";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

function formatQrDate(date: Date) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date).reduce<Record<string, string>>(
    (acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    },
    {}
  );
  // Use dots for date and colons for time to avoid phone number detection
  const datePart = `${parts.day}.${parts.month}.${parts.year}`;
  const timePart = `${parts.hour}:${parts.minute}:${parts.second}`;
  return { datePart, timePart };
}

export async function GET() {
  const storeId = "RF0004214";
  const transactionRef = "841a56eb-07f7-41d3-ba55-e55b8274d6ae";
  const amount = "36.50";
  const orderNumber = "10259";
  const { datePart, timePart } = formatQrDate(new Date());

  // Format: storeId*transactionRef*date*time*amount*orderNumber
  const qrContent = `${storeId}*${transactionRef}*${datePart}*${timePart}*${amount}*${orderNumber}`;

  const qrDataUrl = await QRCode.toDataURL(qrContent, {
    errorCorrectionLevel: "M",
    margin: 4,
    scale: 6,
    color: { dark: "#000000", light: "#ffffff" },
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QR Test</title>
  <style>
    body { font-family: monospace; padding: 20px; max-width: 600px; margin: 0 auto; }
    img { display: block; margin: 20px 0; }
    .content { background: #f0f0f0; padding: 10px; word-break: break-all; }
    h2 { margin-top: 30px; }
  </style>
</head>
<body>
  <h1>QR Code Test</h1>

  <h2>QR Code:</h2>
  <img src="${qrDataUrl}" alt="QR Code" />

  <h2>Content (this is what scanner should show):</h2>
  <div class="content">${qrContent}</div>

  <h2>Parts:</h2>
  <ul>
    <li><strong>storeId:</strong> ${storeId}</li>
    <li><strong>transactionRef:</strong> ${transactionRef}</li>
    <li><strong>date:</strong> ${datePart}</li>
    <li><strong>time:</strong> ${timePart}</li>
    <li><strong>amount:</strong> ${amount}</li>
    <li><strong>orderNumber:</strong> ${orderNumber}</li>
  </ul>

  <p>Сканирайте QR кода и сравнете със съдържанието по-горе.</p>
</body>
</html>
  `;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
