import crypto from 'node:crypto';

export function createSalt() {
  return crypto.randomBytes(16).toString('base64');
}

export function hashPin(pin, saltB64) {
  const salt = Buffer.from(saltB64, 'base64');
  const derived = crypto.scryptSync(String(pin), salt, 64, { N: 1 << 15, r: 8, p: 1 });
  return derived.toString('base64');
}

export function verifyPin(pin, saltB64, hashB64) {
  const got = hashPin(pin, saltB64);
  const a = Buffer.from(got);
  const b = Buffer.from(hashB64);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
