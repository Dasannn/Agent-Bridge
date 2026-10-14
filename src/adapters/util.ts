import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { signalGroup } from "../core/terminal.js";

export interface CommandOutput {
  code: number;
  stdout: string;
  stderr: string;
}

export function findBinary(name: string, env: NodeJS.ProcessEnv): string | undefined {
  for (const dir of (env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const candidate = join(dir, name);
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not here.
    }
  }
  return undefined;
}

/** Runs a command without a terminal. Exit code 124 means timeout, 127 not found. */
export function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs = 30_000,
): Promise<CommandOutput> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    // Its own process group, so a timeout also stops children that hold the output open.
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid !== undefined) signalGroup(child.pid, "SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: stderr || error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? 124 : (code ?? 1), stdout, stderr });
    });
  });
}

/**
 * Installs an npm package into the Agent-Bridge prefix: the parent of the
 * managed environment's first PATH entry (`<root>/prefix/bin`).
 */
export async function npmInstall(pkg: string, env: NodeJS.ProcessEnv): Promise<void> {
  const bin = (env.PATH ?? "").split(":")[0];
  if (!bin) throw new Error("No managed PATH to install into.");
  const result = await runCommand(
    "npm",
    ["install", "--global", "--prefix", dirname(bin), "--no-fund", "--no-audit", pkg],
    env,
    300_000,
  );
  if (result.code !== 0) {
    const tail = `${result.stdout}\n${result.stderr}`.trim().split("\n").slice(-10).join("\n");
    throw new Error(`npm could not install ${pkg}:\n${tail}`);
  }
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

/** Trims every line and joins them, for URLs that a TUI breaks across lines. */
export function joinedScreen(screen: string): string {
  return screen
    .split("\n")
    .map((line) => line.trim())
    .join("");
}
