import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { codex } from "../../src/adapters/codex.js";

const fixture = readFileSync(new URL("../fixtures/codex-login.txt", import.meta.url), "utf8");
const provider = codex.providers[0];

describe("codex adapter", () => {
  it("parsePrompt extracts the device URL and code", () => {
    expect(provider.parsePrompt(fixture)).toEqual({
      url: "https://auth.openai.com/codex/device",
      code: "WXYZ-12345",
    });
  });

  it("parsePrompt waits until the code is drawn", () => {
    const partial = fixture.split("2. Enter")[0];
    expect(provider.parsePrompt(partial)).toBeUndefined();
  });

  it("parsePrompt waits for the whole code", () => {
    const partial = `${fixture.split("WXYZ-12345")[0]}WXYZ-1234`;
    expect(provider.parsePrompt(partial)).toBeUndefined();
  });

  it("metadata matches decision 0005", () => {
    expect(codex.id).toBe("codex");
    expect(codex.binaries).toEqual(["codex"]);
    expect(codex.requiresLogin).toBe(true);
    expect(provider.id).toBe("default");
    expect(provider.command).toEqual(["codex", "login", "--device-auth"]);
    expect(provider.strategy).toBe("device-code");
    expect(codex.delegationExample).toContain("bridge run codex -- exec");
  });
});
