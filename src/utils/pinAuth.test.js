import { describe, expect, it } from "vitest";
import { encodePin, isValidPin, matchesStoredPin, normalizePin } from "./pinAuth.js";

describe("pinAuth", () => {
  it("normalizes and validates 4 digit pins", () => {
    expect(normalizePin(" 1357 ")).toBe("1357");
    expect(isValidPin("1357")).toBe(true);
    expect(isValidPin("135")).toBe(false);
    expect(isValidPin("13579")).toBe(false);
    expect(isValidPin("13a7")).toBe(false);
  });

  it("encodes pins for storage and matches encoded pins during login", () => {
    const stored = encodePin("1357");

    expect(stored).toBe("MTM1Nw==");
    expect(matchesStoredPin(stored, "1357")).toBe(true);
    expect(matchesStoredPin(stored, "2468")).toBe(false);
  });

  it("keeps legacy plaintext pins login-compatible", () => {
    expect(matchesStoredPin("2468", "2468")).toBe(true);
    expect(matchesStoredPin("2468", "1357")).toBe(false);
  });

  it("rejects invalid pins before storing", () => {
    expect(() => encodePin("123")).toThrow("PIN muss genau 4 Ziffern haben.");
  });
});
