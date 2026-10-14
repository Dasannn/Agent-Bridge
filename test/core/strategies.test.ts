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

  it("rejects a URL instead of a code", () => {
    const result = validateResponse("paste-code", "https://x/cb?code=abc&state=d");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/only the code/i);
  });

  it("accepts anything for device-code and ignores it", () => {
    expect(validateResponse("device-code", undefined)).toEqual({ ok: true });
    expect(validateResponse("device-code", "whatever")).toEqual({ ok: true });
  });
});

describe("validateResponse for loopback-callback", () => {
  const prompt = {
    url: "https://auth.example.test/authorize?client_id=c&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=S1",
  };
  const check = (input: string | undefined) => validateResponse("loopback-callback", input, prompt);

  it("accepts the callback address and returns the path to request", () => {
    expect(check(" http://localhost:1455/auth/callback?code=abc&state=S1 ")).toEqual({
      ok: true,
      value: "/auth/callback?code=abc&state=S1",
    });
  });

  it("treats localhost and 127.0.0.1 alike, and accepts a missing scheme", () => {
    expect(check("http://127.0.0.1:1455/auth/callback?code=abc&state=S1").ok).toBe(true);
    expect(check("localhost:1455/auth/callback?code=abc&state=S1").ok).toBe(true);
  });

  it("passes a provider error through so the CLI can report it", () => {
    expect(check("http://localhost:1455/auth/callback?error=access_denied&state=S1").ok).toBe(true);
  });

  it("rejects an address for another host, port, or path", () => {
    expect(check("http://evil.test:1455/auth/callback?code=abc&state=S1").ok).toBe(false);
    expect(check("http://localhost:9999/auth/callback?code=abc&state=S1").ok).toBe(false);
    expect(check("http://localhost:1455/other?code=abc&state=S1").ok).toBe(false);
  });

  it("rejects an address from another login", () => {
    const result = check("http://localhost:1455/auth/callback?code=abc&state=OTHER");
    expect(result.ok === false && result.error).toMatch(/different login/i);
  });

  it("rejects a bare code or nothing, explaining what to paste", () => {
    for (const input of ["abc123", "", undefined]) {
      const result = check(input);
      expect(result.ok === false && result.error).toMatch(/address bar/i);
    }
    expect(check("http://localhost:1455/auth/callback?state=S1").ok).toBe(false);
  });
});
