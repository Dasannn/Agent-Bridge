import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { connectedProviders, opencode } from "../../src/adapters/opencode.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const provider = (id: string) => opencode.providers.find((p) => p.id === id);

describe("opencode adapter", () => {
  it("parsePrompt extracts the device URL and code", () => {
    expect(provider("openai")?.parsePrompt(fixture("opencode-openai.txt"))).toEqual({
      url: "https://auth.openai.com/codex/device",
      code: "WXYZ-12345",
    });
  });

  it("parsePrompt waits until the code is drawn", () => {
    expect(provider("openai")?.parsePrompt("●  Go to: https://auth.openai.com/codex/device")).toBe(
      undefined,
    );
  });

  it("reads connected providers from the credentials section only", () => {
    expect(connectedProviders(fixture("opencode-list-openai.txt"))).toEqual(["OpenAI"]);
    expect(connectedProviders(fixture("opencode-list-env-only.txt"))).toEqual([]);
  });

  it("selects menu entries by waiting for their text", () => {
    expect(provider("openai")?.keys).toEqual([
      { after: "Search:", send: "OpenAI" },
      { after: "(1 match)", send: "\r" },
      { after: "Login method", send: "\u001b[B" },
      { after: "● ChatGPT Pro/Plus (headless)", send: "\r" },
    ]);
    expect(provider("github-copilot")?.keys).toEqual([
      { after: "Search:", send: "Copilot" },
      { after: "(1 match)", send: "\r" },
      { after: "deployment type", send: "\r" },
    ]);
  });

  it("metadata matches decision 0002", () => {
    expect(opencode.id).toBe("opencode");
    expect(opencode.binaries).toEqual(["opencode"]);
    expect(opencode.requiresLogin).toBe(false);
    expect(opencode.providers.map((p) => p.id)).toEqual(["openai", "github-copilot"]);
    for (const p of opencode.providers) {
      expect(p.command).toEqual(["opencode", "providers", "login"]);
      expect(p.strategy).toBe("device-code");
    }
    expect(opencode.delegationExample).toContain("bridge run opencode -- run");
  });
});
