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

const ENTER = "\r";
const UP = "\u001b[A";
const DOWN = "\u001b[B";
const RIGHT = "\u001b[C";
const LEFT = "\u001b[D";

export type LogoutAction = { send: string } | "done" | undefined;

/**
 * The key to press next while signing out of the TUI, "done" once signed out,
 * or undefined to wait. Before it accepts `/logout`, a fresh install shows a
 * first-run setup that ends with the terms and a data-sharing checkbox, which
 * is on by default; Agent-Bridge turns sharing off and never confirms with it
 * on.
 */
export function logoutAction(screen: string): LogoutAction {
  if (/currently not signed in|Select login method/.test(screen)) return "done";
  if (/>\s*\/logout\s+Log out/.test(screen)) return { send: ENTER };
  if (/Do you trust the contents/.test(screen)) {
    return /> Yes, I trust this folder/.test(screen) ? { send: ENTER } : { send: UP };
  }
  if (/Terms of Service & Data Use/.test(screen)) {
    const sharing = /\[x\] Yes, I agree/.test(screen);
    if (/>\s*\[[x ]\] Yes, I agree/.test(screen)) return { send: sharing ? ENTER : DOWN };
    if (/>\s+Previous/.test(screen)) return { send: sharing ? UP : RIGHT };
    if (/>\s+Done/.test(screen)) return { send: sharing ? LEFT : ENTER };
    return undefined;
  }
  if (/Welcome to Antigravity CLI!/.test(screen) && /\[Next\]/.test(screen)) {
    return { send: ENTER };
  }
  // Typed but its menu is not drawn yet.
  if (/^>\s*\/logout\s*$/m.test(screen)) return undefined;
  if (/\? for shortcuts/.test(screen)) return { send: "/logout" };
  return undefined;
}

const LOGOUT_TIMEOUT_MS = 60_000;
// A key whose screen has not changed after this long is taken as lost and sent again.
const RESEND_MS = 3000;

/** Antigravity has no logout subcommand and refuses `/logout` in print mode. */
async function logout(env: NodeJS.ProcessEnv): Promise<void> {
  const binary = findBinary("agy", env);
  if (!binary) return;
  // agy asks to trust its working folder; an empty scratch folder is safe to trust.
  const cwd = mkdtempSync(join(tmpdir(), "agy-logout-"));
  const terminal = spawnTerminal(binary, [], { env, cwd });
  try {
    const deadline = Date.now() + LOGOUT_TIMEOUT_MS;
    let acted = "";
    let actedAt = 0;
    while (Date.now() < deadline) {
      const screen = terminal.screen();
      const action = logoutAction(screen);
      if (action === "done") return;
      if (action && (screen !== acted || Date.now() - actedAt > RESEND_MS)) {
        terminal.write(action.send);
        acted = screen;
        actedAt = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } finally {
    await terminal.kill();
    rmSync(cwd, { recursive: true, force: true });
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
      keys: [{ after: "Select login method", send: "\r" }],
      strategy: "paste-code",
      parsePrompt,
      isAuthenticated,
      logout,
    },
  ],
};
