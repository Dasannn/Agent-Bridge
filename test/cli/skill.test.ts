import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adapters } from "../../src/adapters/index.js";
import { main } from "../../src/cli/main.js";
import { createRegistry } from "../../src/core/adapter.js";
import { readSkill } from "../../src/core/skill.js";

const SKILL = join(".agents", "skills", "agent-bridge", "SKILL.md");

function setup(cwd: string) {
  const out = { stdout: "", stderr: "" };
  const io = {
    stdout: (t: string) => {
      out.stdout += t;
    },
    stderr: (t: string) => {
      out.stderr += t;
    },
  };
  const env = { PATH: process.env.PATH, HOME: mkdtempSync(join(tmpdir(), "ab-skill-home-")) };
  const run = (...argv: string[]) =>
    main(argv, io, { env, registry: createRegistry(adapters), cwd });
  return { out, run };
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "ab-repo-"));
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "src", "deep"), { recursive: true });
  return root;
}

const listAll = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: "utf8" }).sort();

describe("bridge skill", () => {
  it("--print shows the skill", async () => {
    const { out, run } = setup(tmpdir());
    expect(await run("skill", "--print")).toBe(0);
    expect(out.stdout).toContain(readSkill().trim());
  });

  it("asks for --print or --repo", async () => {
    const { out, run } = setup(tmpdir());
    expect(await run("skill")).toBe(1);
    expect(out.stderr).toContain("--print");
  });

  it("--repo writes only the skill file at the repository root", async () => {
    const root = repo();
    const before = listAll(root);
    const { out, run } = setup(join(root, "src", "deep"));
    expect(await run("skill", "--repo")).toBe(0);
    expect(readFileSync(join(root, SKILL), "utf8")).toBe(readSkill());
    const added = listAll(root).filter((p) => !before.includes(p));
    expect(added).toEqual([".agents", ".agents/skills", ".agents/skills/agent-bridge", SKILL]);
    expect(out.stdout).toMatch(/review and commit/i);
  });

  it("--repo replaces a previous Agent-Bridge skill", async () => {
    const root = repo();
    mkdirSync(join(root, ".agents", "skills", "agent-bridge"), { recursive: true });
    writeFileSync(join(root, SKILL), readSkill().replace("Agent-Bridge", "Old Agent-Bridge"));
    const { run } = setup(root);
    expect(await run("skill", "--repo")).toBe(0);
    expect(readFileSync(join(root, SKILL), "utf8")).toBe(readSkill());
  });

  it("--repo refuses to overwrite a file it did not write", async () => {
    const root = repo();
    mkdirSync(join(root, ".agents", "skills", "agent-bridge"), { recursive: true });
    writeFileSync(join(root, SKILL), "my own skill\n");
    const { out, run } = setup(root);
    expect(await run("skill", "--repo")).toBe(1);
    expect(readFileSync(join(root, SKILL), "utf8")).toBe("my own skill\n");
    expect(out.stderr).toMatch(/not written by Agent-Bridge/i);
  });

  it("--repo fails outside a repository", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ab-norepo-"));
    const { out, run } = setup(dir);
    expect(await run("skill", "--repo")).toBe(1);
    expect(out.stderr).toMatch(/not inside a Git repository/i);
    expect(listAll(dir)).toEqual([]);
  });
});
