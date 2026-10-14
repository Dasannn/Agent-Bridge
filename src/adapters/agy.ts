// Antigravity CLI (decision 0003).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Adapter, LoginPrompt } from "../core/adapter.js";
import { spawnTerminal } from "../core/terminal.js";
import { findBinary, joinedScreen, runCommand } from "./util.js";

const INSTALL_SCRIPT = "https://antigravity.google/cli/install.sh";
// The TUI draws the URL across several lines and follows it with this label.
const URL_PATTERN =
  /https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?\S*?&state=[\w-]+(?=Copy and paste|If you)/;

function parsePrompt(screen: string): LoginPrompt | undefined {
  const match = joinedScreen(screen).match(URL_PATTERN);
  return match ? { url: match[0] } : undefined;
}

async function install(env: NodeJS.ProcessEnv): Promise<void> {
  const bin = (env.PATH ?? "").split(":")[0];
  const dir = mkdtempSync(join(tmpdir(), "agy-install-"));
  const script = join(dir, "install.sh");
  try {
    const download = await runCommand(
      "curl",
      ["-fsSL", "-o", script, INSTALL_SCRIPT],
      env,
      120_000,
    );
    if (download.code !== 0)
      throw new Error(`Could not download ${INSTALL_SCRIPT}: ${download.stderr}`);
    const result = await runCommand("bash", [script, "--dir", bin], env, 300_000);
    if (result.code !== 0 || !findBinary("agy", env)) {
      const tail = `${result.stdout}\n${result.stderr}`.trim().split("\n").slice(-10).join("\n");
      throw new Error(`The Antigravity installer failed:\n${tail}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function isAuthenticated(env: NodeJS.ProcessEnv): Promise<boolean> {
  const binary = findBinary("agy", env);
  if (!binary) return false;
  return (await runCommand(binary, ["models"], env, 60_000)).code === 0;
}

/** Antigravity has no logout subcommand; its TUI accepts `/logout`. */
async function logout(env: NodeJS.ProcessEnv): Promise<void> {
  const binary = findBinary("agy", env);
  if (!binary) return;
  const terminal = spawnTerminal(binary, [], { env, cwd: env.HOME ?? tmpdir() });
  try {
    await terminal.waitFor((screen) => screen.trim().length > 0, 30_000);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    terminal.write("/logout\r");
    await terminal.waitFor((screen) => /signed out|logged out|not signed in/i.test(screen), 15_000);
  } finally {
    await terminal.kill();
  }
}

export const agy: Adapter = {
  id: "agy",
  displayName: "Antigravity",
  binaries: ["agy"],
  requiresLogin: true,
  isInstalled: async (env) => findBinary("agy", env) !== undefined,
  install,
  delegationExample:
    'bridge run agy -- -p "<task>" --output-format json --dangerously-skip-permissions',
  providers: [
    {
      id: "default",
      command: ["agy"],
      keys: ["\r"],
      strategy: "paste-code",
      parsePrompt,
      isAuthenticated,
      logout,
    },
  ],
};
