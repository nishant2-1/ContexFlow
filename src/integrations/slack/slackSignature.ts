import crypto from "node:crypto";

export function verifySlackSignature(params: {
  signingSecret?: string;
  timestamp?: string;
  signature?: string;
  rawBody: string;
}): boolean {
  const { signingSecret, timestamp, signature, rawBody } = params;

  if (!signingSecret) {
    return true;
  }

  if (!timestamp || !signature) {
    return false;
  }

  const fiveMinutes = 60 * 5;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > fiveMinutes) {
    return false;
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(base).digest("hex");
  const expected = `v0=${hmac}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
