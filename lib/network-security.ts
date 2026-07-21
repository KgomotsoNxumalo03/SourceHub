import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function createSecureToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashRestrictedCredential(value: string, pepper: string) {
  return createHash("sha256").update(`${pepper}:${value}`, "utf8").digest("hex");
}

export function createRequestSignature(secret: string, timestamp: string, nonce: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`, "utf8").digest("hex");
}

export function secureStringEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function verifyRequestSignature(secret: string, timestamp: string, nonce: string, body: string, signature: string) {
  return secureStringEqual(createRequestSignature(secret, timestamp, nonce, body), signature.toLowerCase());
}

export function isRequestTimestampFresh(timestamp: string, maximumSkewSeconds: number, now = new Date()) {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) && Math.abs(now.getTime() - parsed) <= maximumSkewSeconds * 1000;
}

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
