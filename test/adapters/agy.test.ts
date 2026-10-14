import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { agy } from "../../src/adapters/agy.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const provider = agy.providers[0];

describe("agy adapter", () => {
  it("parsePrompt extracts the full OAuth URL from the fixture", () => {
    const prompt = provider.parsePrompt(fixture("agy-login.txt"));
    expect(prompt?.url.startsWith("https://accounts.google.com/o/oauth2/auth?")).toBe(true);
    expect(prompt?.url).toContain("redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback");
    expect(prompt?.url.endsWith("&state=PLACEHOLDER")).toBe(true);
    expect(prompt?.url).not.toMatch(/\s/);
    expect(prompt?.code).toBeUndefined();
  });

  it("parsePrompt returns undefined before the URL is drawn", () => {
    expect(provider.parsePrompt(fixture("agy-menu.txt"))).toBeUndefined();
  });

  it("metadata matches decision 0003", () => {
    expect(agy.id).toBe("agy");
    expect(agy.binaries).toEqual(["agy"]);
    expect(agy.requiresLogin).toBe(true);
    expect(agy.providers).toHaveLength(1);
    expect(provider.id).toBe("default");
    expect(provider.command).toEqual(["agy"]);
    expect(provider.keys).toEqual([{ after: "Select login method", send: "\r" }]);
    expect(provider.strategy).toBe("paste-code");
    expect(agy.delegationExample).toContain("bridge run agy -- -p");
  });
});
