import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { claude } from "../../src/adapters/claude.js";

const fixture = readFileSync(new URL("../fixtures/claude-login.txt", import.meta.url), "utf8");
const provider = claude.providers[0];

describe("claude adapter", () => {
  it("parsePrompt extracts the URL and keeps code=true", () => {
    const prompt = provider.parsePrompt(fixture);
    expect(prompt?.url.startsWith("https://claude.com/cai/oauth/authorize?code=true&")).toBe(true);
    expect(prompt?.url).toContain("state=PLACEHOLDER");
    expect(prompt?.url).not.toMatch(/\s/);
    expect(prompt?.code).toBeUndefined();
  });

  it("parsePrompt waits for the paste prompt", () => {
    expect(provider.parsePrompt("Opening browser to sign in…")).toBeUndefined();
  });

  it("metadata matches decision 0006", () => {
    expect(claude.id).toBe("claude");
    expect(claude.binaries).toEqual(["claude"]);
    expect(provider.command).toEqual(["claude", "auth", "login"]);
    expect(provider.strategy).toBe("paste-code");
    expect(claude.delegationExample).toContain("bridge run claude -- -p");
  });
});
