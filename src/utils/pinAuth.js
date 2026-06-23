function toBase64(value) {
  const text = String(value || "");
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(text);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf-8").toString("base64");
  }
  throw new Error("Base64 encoding is not available.");
}

function fromBase64(value) {
  const text = String(value || "");
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(text);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "base64").toString("utf-8");
  }
  throw new Error("Base64 decoding is not available.");
}

export function normalizePin(value) {
  return String(value || "").trim();
}

export function isValidPin(value) {
  return /^\d{4}$/.test(normalizePin(value));
}

export function encodePin(value) {
  const pin = normalizePin(value);
  if (!isValidPin(pin)) {
    throw new Error("PIN muss genau 4 Ziffern haben.");
  }
  return toBase64(pin);
}

export function matchesStoredPin(storedValue, enteredValue) {
  const stored = normalizePin(storedValue);
  const entered = normalizePin(enteredValue);

  if (!stored || !entered) return false;
  if (stored === entered) return true;

  try {
    return normalizePin(fromBase64(stored)) === entered;
  } catch {
    return false;
  }
}
