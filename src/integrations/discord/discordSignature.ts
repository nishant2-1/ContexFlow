import crypto from "node:crypto";

export function verifyDiscordSignature(params: {
  secret?: string;
  rawBody: string;
  signature?: string;
}): boolean {
  const { secret, rawBody, signature } = params;

  if (!secret) {
    return true;
  }

  if (!signature) {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
