import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adapters } from "../../src/adapters/index.js";
import { agentsSection, syncSkill } from "../../src/core/skill.js";

const skillFile = new URL("../../skill/SKILL.md", import.meta.url);
const skill = () => readFileSync(skillFile, "utf8");

describe("skill", () => {
  it("lists every adapter with its delegation, model, and effort options", () => {
    const section = agentsSection(adapters);
    for (const adapter of adapters) {
      expect(section).toContain(`### ${adapter.displayName} (\`${adapter.id}\`)`);
      expect(section).toContain(adapter.delegationExample);
      expect(section).toContain(adapter.models.list);
      expect(section).toContain(adapter.models.model);
      expect(section).toContain(adapter.models.effort);
    }
  });

  it("replaces only the generated section", () => {
    const template = "intro\n<!-- agents:start -->\nold\n<!-- agents:end -->\noutro\n";
    const synced = syncSkill(template, adapters);
    expect(synced.startsWith("intro\n<!-- agents:start -->\n")).toBe(true);
    expect(synced.endsWith("<!-- agents:end -->\noutro\n")).toBe(true);
    expect(synced).not.toContain("old");
    expect(() => syncSkill("no markers", adapters)).toThrow(/markers/);
  });

  it("the committed skill is up to date with the adapters (run npm run build)", () => {
    expect(skill()).toBe(syncSkill(skill(), adapters));
  });

  it("has front matter with a name and a description", () => {
    const front = skill().match(/^---\nname: agent-bridge\ndescription: (.+)\n---\n/);
    expect(front?.[1].length).toBeGreaterThan(50);
  });

  it("stays short", () => {
    expect(skill().split("\n").length).toBeLessThan(170);
  });
});

describe("/bridge-code command", () => {
  const command = () =>
    readFileSync(new URL("../../skill/bridge-code.md", import.meta.url), "utf8");

  it("runs bridge complete with the pasted text, quoted, and allows only that", () => {
    expect(command()).toMatch(
      /^---\n[\s\S]*allowed-tools: Bash\(bridge complete \*\)\n[\s\S]*---\n/,
    );
    expect(command()).toContain("!`bridge complete '$ARGUMENTS'`");
  });
});
