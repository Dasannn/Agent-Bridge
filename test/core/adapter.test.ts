import { describe, expect, it } from "vitest";
import { type Adapter, createRegistry, type LoginProvider } from "../../src/core/adapter.js";

function provider(id: string): LoginProvider {
  return {
    id,
    command: ["x"],
    strategy: "device-code",
    parsePrompt: () => undefined,
    isAuthenticated: async () => false,
    logout: async () => {},
  };
}

function adapter(id: string, providers: LoginProvider[]): Adapter {
  return {
    id,
    displayName: id,
    binaries: [id],
    requiresLogin: true,
    providers,
    isInstalled: async () => true,
    install: async () => {},
    delegationExample: `${id} run`,
  };
}

const single = adapter("agy", [provider("default")]);
const multi = adapter("opencode", [provider("openai"), provider("github-copilot")]);
const registry = createRegistry([single, multi]);

describe("registry", () => {
  it("finds adapters by id", () => {
    expect(registry.get("agy")).toBe(single);
    expect(registry.get("missing")).toBeUndefined();
  });

  it("lists adapters in registration order", () => {
    expect(registry.list().map((a) => a.id)).toEqual(["agy", "opencode"]);
  });

  it("returns the only provider when none is given", () => {
    expect(registry.provider(single)?.id).toBe("default");
  });

  it("returns the provider matching the id", () => {
    expect(registry.provider(multi, "github-copilot")?.id).toBe("github-copilot");
  });

  it("returns undefined when the choice is ambiguous", () => {
    expect(registry.provider(multi)).toBeUndefined();
  });

  it("returns undefined for an unknown provider", () => {
    expect(registry.provider(single, "nope")).toBeUndefined();
  });
});
