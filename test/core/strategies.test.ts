import { describe, expect, it } from "vitest";
import { validateResponse } from "../../src/core/strategies.js";

describe("validateResponse", () => {
  it("accepts and trims a pasted code", () => {
    expect(validateResponse("paste-code", "  4/0AXabc_-xyz \n")).toEqual({
      ok: true,
      value: "4/0AXabc_-xyz",
    });
  });

  it("rejects an empty pasted code", () => {
    expect(validateResponse("paste-code", "   ").ok).toBe(false);
    expect(validateResponse("paste-code", undefined).ok).toBe(false);
  });

  it("rejects a pasted code with inner whitespace", () => {
    expect(validateResponse("paste-code", "abc def").ok).toBe(false);
  });

  it("rejects a pasted code longer than 2048 characters", () => {
    expect(validateResponse("paste-code", "a".repeat(2049)).ok).toBe(false);
    expect(validateResponse("paste-code", "a".repeat(2048)).ok).toBe(true);
  });

  it("explains what to paste when rejecting", () => {
    const result = validateResponse("paste-code", "");
    expect(result.ok === false && result.error).toMatch(/paste/i);
  });

  it("accepts anything for device-code and ignores it", () => {
    expect(validateResponse("device-code", undefined)).toEqual({ ok: true });
    expect(validateResponse("device-code", "whatever")).toEqual({ ok: true });
  });
});
