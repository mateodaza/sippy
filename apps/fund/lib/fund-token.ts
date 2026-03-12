import { createHmac, timingSafeEqual } from 'node:crypto';

const FUND_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string {
  const secret = process.env.FUND_TOKEN_SECRET;
  if (!secret) {
    throw new Error('FUND_TOKEN_SECRET env var is required');
  }
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * Create a signed, opaque fund token that encodes a phone number.
 * Token format: base64url(payload).signature
 * Payload: phone|expiryTimestamp
 */
export function createFundToken(phone: string): string {
  const expiry = Date.now() + FUND_TOKEN_TTL_MS;
  const payload = `${phone}|${expiry}`;
  const encoded = Buffer.from(payload).toString('base64url');
  const signature = sign(encoded, getSecret());
  return `${encoded}.${signature}`;
}

/**
 * Verify and decode a fund token. Returns the phone number or null if invalid/expired.
 */
export function verifyFundToken(token: string): string | null {
  try {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;

    const expectedSig = sign(encoded, getSecret());
    const sigBuffer = Buffer.from(signature, 'base64url');
    const expectedBuffer = Buffer.from(expectedSig, 'base64url');

    if (sigBuffer.length !== expectedBuffer.length) return null;
    if (!timingSafeEqual(sigBuffer, expectedBuffer)) return null;

    const payload = Buffer.from(encoded, 'base64url').toString();
    const separatorIdx = payload.lastIndexOf('|');
    if (separatorIdx === -1) return null;

    const phone = payload.substring(0, separatorIdx);
    const expiry = parseInt(payload.substring(separatorIdx + 1), 10);

    if (isNaN(expiry) || Date.now() > expiry) return null;

    return phone;
  } catch {
    return null;
  }
}
