import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { codex } from "../../src/adapters/codex.js";
import { callbackTarget } from "../../src/core/strategies.js";

const fixture = readFileSync(new URL("../fixtures/codex-login.txt", import.meta.url), "utf8");
const linkFixture = readFileSync(
  new URL("../fixtures/codex-login-link.txt", import.meta.url),
  "utf8",
);
const provider = codex.providers[0];
const device = provider.device as NonNullable<typeof provider.device>;

describe("codex adapter", () => {
  it("parsePrompt extracts the sign-in link and its loopback callback", () => {
    const prompt = provider.parsePrompt(linkFixture);
    expect(prompt?.url.startsWith("https://auth.openai.com/oauth/authorize?")).toBe(true);
    expect(prompt?.url.endsWith("&originator=codex_cli_rs")).toBe(true);
    expect(callbackTarget(prompt)).toEqual({
      origin: "http://127.0.0.1:1455",
      port: 1455,
      path: "/auth/callback",
      state: "STATE-PLACEHOLDER",
    });
  });

  it("parsePrompt waits until the whole link is drawn", () => {
    expect(provider.parsePrompt(linkFixture.split("On a remote")[0])).toBeUndefined();
  });

  it("parsePrompt extracts the device URL and code", () => {
    expect(device.parsePrompt(fixture)).toEqual({
      url: "https://auth.openai.com/codex/device",
      code: "WXYZ-12345",
    });
  });

  it("parsePrompt waits until the code is drawn", () => {
    const partial = fixture.split("2. Enter")[0];
    expect(device.parsePrompt(partial)).toBeUndefined();
  });

  it("parsePrompt waits for the whole code", () => {
    const partial = `${fixture.split("WXYZ-12345")[0]}WXYZ-1234`;
    expect(device.parsePrompt(partial)).toBeUndefined();
  });

  it("metadata matches decision 0005", () => {
    expect(codex.id).toBe("codex");
    expect(codex.binaries).toEqual(["codex"]);
    expect(codex.requiresLogin).toBe(true);
    expect(provider.id).toBe("default");
    expect(provider.command).toEqual(["codex", "login"]);
    expect(provider.strategy).toBe("loopback-callback");
    expect(device.command).toEqual(["codex", "login", "--device-auth"]);
    expect(device.strategy).toBe("device-code");
    expect(codex.delegationExample).toContain("bridge run codex -- exec");
  });
});
