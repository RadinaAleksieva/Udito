import crypto from "crypto";

type WixInstancePayload = {
  instanceId?: string;
  siteId?: string;
  exp?: number;
};

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function toBase64Url(input: string) {
  return input.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function decodeWixInstanceToken(
  token: string,
  appSecret?: string | null
): WixInstancePayload | null {
  const parts = token.split(".");
  if (parts.length === 3) {
    const payload = decodeBase64Url(parts[1]);
    if (!payload) return null;
    try {
      return JSON.parse(payload) as WixInstancePayload;
    } catch {
      return null;
    }
  }

  if (parts.length === 2) {
    const [payloadPart, signaturePart] = parts;
    if (appSecret) {
      const expected = crypto
        .createHmac("sha256", appSecret)
        .update(payloadPart)
        .digest("base64");
      const expectedUrl = toBase64Url(expected);
      const actualUrl = toBase64Url(signaturePart);
      if (!safeEqual(expectedUrl, actualUrl)) {
        return null;
      }
    }

    const payload = decodeBase64Url(payloadPart);
    if (!payload) return null;
    try {
      return JSON.parse(payload) as WixInstancePayload;
    } catch {
      return null;
    }
  }

  return null;
}
