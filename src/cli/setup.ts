// `bridge setup` (FR-2): prepares a session from an environment setup script.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findBinary } from "../adapters/util.js";
import { detectHost } from "../core/host.js";
import { type CommandResult, mask } from "../core/output.js";
import { managedEnv, resolveHome } from "../core/paths.js";
import { grantPermissions, permissionRules } from "../core/permissions.js";
import { readCommand, readSkill } from "../core/skill.js";
import type { Deps } from "./commands.js";

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

export async function setup(
  deps: Deps,
  options: { agents?: string; permissions: boolean },
): Promise<CommandResult> {
  const known = deps.registry.list().map((adapter) => adapter.id);
  const ids = (options.agents ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    return {
      ok: false,
      message: `Name the CLIs with --agents. Known agents: ${known.join(", ")}.`,
    };
  }

  const host = detectHost(deps.env);
  const cliEnv = managedEnv(deps.env, resolveHome(deps.env));
  const lines: string[] = [];
  let ok = true;
  const binaries: string[] = [];

  for (const id of ids) {
    const adapter = deps.registry.get(id);
    if (!adapter) {
      lines.push(`${id}: unknown agent (known: ${known.join(", ")})`);
      ok = false;
    } else if (adapter.id === host) {
      lines.push(`${id}: skipped (host agent)`);
    } else if (await adapter.isInstalled(cliEnv)) {
      lines.push(`${id}: already installed`);
      binaries.push(...adapter.binaries);
    } else {
      try {
        await adapter.install(cliEnv);
        lines.push(`${id}: installed`);
        binaries.push(...adapter.binaries);
      } catch (error) {
        const detail = mask(error instanceof Error ? error.message : String(error));
        lines.push(`${id}: install failed\n${detail.replace(/^/gm, "  ")}`);
        ok = false;
      }
    }
  }

  if (host === "codex") {
    lines.push(
      "skill: Codex cannot load user skills; run `bridge skill --print` in a task, or `bridge skill --repo` to add it to the repository.",
    );
  } else {
    const claudeDir = join(deps.env.HOME ?? "", ".claude");
    try {
      writeFile(join(claudeDir, "skills", "agent-bridge", "SKILL.md"), readSkill());
      writeFile(join(claudeDir, "commands", "bridge-code.md"), readCommand());
      lines.push(`skill: installed in ${claudeDir} (skill agent-bridge, command /bridge-code)`);
    } catch (error) {
      lines.push(`skill: failed (${(error as Error).message})`);
      ok = false;
    }
    if (options.permissions) {
      const rules = permissionRules(binaries);
      const result = grantPermissions(join(claudeDir, "settings.json"), rules);
      if (result.ok) {
        lines.push(`permissions: allowed ${rules.join(", ")}`);
      } else {
        lines.push(`permissions: failed (${result.error})`);
        ok = false;
      }
    } else {
      lines.push("permissions: skipped (--no-permissions)");
    }
  }
  if (!findBinary("bridge", deps.env)) {
    lines.push(
      "bridge: not on PATH, so the agent cannot run it. Install Agent-Bridge with `npm install -g` (not npx) in the setup script.",
    );
  }
  return { ok, message: lines.join("\n") };
}
