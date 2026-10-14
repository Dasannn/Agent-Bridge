import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../../src/cli/main.js";
import { type Adapter, createRegistry } from "../../src/core/adapter.js";
import { readCommand, readSkill } from "../../src/core/skill.js";

function fakeAdapter(id: string, installError?: string): Adapter {
  let installed = false;
  return {
    id,
    displayName: id.toUpperCase(),
    binaries: [id],
    requiresLogin: true,
    providers: [],
    isInstalled: async () => installed,
    install: async () => {
      if (installError) throw new Error(installError);
      installed = true;
    },
    delegationExample: `${id} run`,
    models: { list: "-", model: "-", effort: "-" },
  };
}

function setup(hostEnv: NodeJS.ProcessEnv) {
  const home = mkdtempSync(join(tmpdir(), "ab-setup-"));
  const env = { PATH: process.env.PATH, HOME: home, ...hostEnv };
  const registry = createRegistry([
    fakeAdapter("alpha"),
    fakeAdapter("beta", "npm could not reach the registry"),
    fakeAdapter("claude"),
  ]);
  const out = { stdout: "", stderr: "" };
  const io = {
    stdout: (t: string) => {
      out.stdout += t;
    },
    stderr: (t: string) => {
      out.stderr += t;
    },
  };
  const run = (...argv: string[]) => main(argv, io, { env, registry });
  const path = (...parts: string[]) => join(home, ".claude", ...parts);
  return { out, run, path };
}

const claude = { CLAUDE_CODE_ENTRYPOINT: "remote" };
const codex = { CODEX_THREAD_ID: "t1" };
const settings = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("bridge setup", () => {
  it("installs CLIs, the skill, the command, and permissions, skipping the host", async () => {
    const { out, run, path } = setup(claude);
    expect(await run("setup", "--agents", "alpha,claude")).toBe(0);
    expect(out.stdout).toMatch(/claude: skipped \(host agent\)/);
    expect(out.stdout).toMatch(/alpha: installed/);
    expect(readFileSync(path("skills", "agent-bridge", "SKILL.md"), "utf8")).toBe(readSkill());
    expect(readFileSync(path("commands", "bridge-code.md"), "utf8")).toBe(readCommand());
    const allow = settings(path("settings.json")).permissions.allow;
    expect(allow).toEqual(["Bash(agent-bridge *)", "Bash(bridge *)", "Bash(alpha *)"]);
    expect(out.stdout).toContain("Bash(alpha *)");
  });

  it("continues after a failed install and exits non-zero", async () => {
    const { out, run, path } = setup(claude);
    expect(await run("setup", "--agents", "beta,alpha")).toBe(1);
    expect(out.stdout + out.stderr).toMatch(/beta: install failed/);
    expect(out.stdout + out.stderr).toContain("npm could not reach the registry");
    expect(out.stdout + out.stderr).toMatch(/alpha: installed/);
    expect(existsSync(path("skills", "agent-bridge", "SKILL.md"))).toBe(true);
  });

  it("--no-permissions leaves the settings alone", async () => {
    const { run, path } = setup(claude);
    expect(await run("setup", "--agents", "alpha", "--no-permissions")).toBe(0);
    expect(existsSync(path("settings.json"))).toBe(false);
  });

  it("is safe to run twice", async () => {
    const { out, run, path } = setup(claude);
    await run("setup", "--agents", "alpha");
    const first = readFileSync(path("settings.json"), "utf8");
    expect(await run("setup", "--agents", "alpha")).toBe(0);
    expect(out.stdout).toMatch(/alpha: already installed/);
    expect(readFileSync(path("settings.json"), "utf8")).toBe(first);
  });

  it("inside Codex, skips the skill and permissions and explains bridge skill", async () => {
    const { out, run, path } = setup(codex);
    expect(await run("setup", "--agents", "alpha")).toBe(0);
    expect(existsSync(path())).toBe(false);
    expect(out.stdout).toContain("bridge skill --print");
  });

  it("requires known agents", async () => {
    const { out, run } = setup(claude);
    expect(await run("setup")).toBe(1);
    expect(out.stderr).toContain("alpha, beta, claude");
    expect(await run("setup", "--agents", "alpha,nope")).toBe(1);
    expect(out.stdout + out.stderr).toMatch(/nope: unknown agent/);
  });
});
