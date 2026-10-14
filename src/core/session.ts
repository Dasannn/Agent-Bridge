import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Adapter, LoginPrompt, LoginProvider, StrategyId } from "./adapter.js";
import { type BridgeHome, sessionPaths } from "./paths.js";
import { signalGroup } from "./terminal.js";

export interface SessionState {
  pid: number;
  /** Process (group) of the CLI the runner drives. */
  cliPid: number;
  agent: string;
  provider: string;
  strategy: StrategyId;
  prompt: LoginPrompt;
  startedAt: string;
}

export interface RunnerConfig {
  agent: string;
  provider: string;
  adapterModule: string;
  home: BridgeHome;
  promptTimeoutMs: number;
  idleTimeoutMs: number;
}

export type StartResult =
  | { ok: true; prompt: LoginPrompt }
  | { ok: false; error: string; screen?: string };

export type CompleteResult =
  | { status: "done"; ok: boolean; message: string }
  | { status: "rejected"; error: string }
  | { status: "no-session" };

export const DEFAULT_PROMPT_TIMEOUT_MS = 30_000;
export const DEFAULT_IDLE_TIMEOUT_MS = 20 * 60_000;
const COMPLETE_TIMEOUT_MS: Record<StrategyId, number> = {
  "paste-code": 120_000,
  "device-code": 900_000,
};

const defaultRunnerPath = () => fileURLToPath(new URL("./runner.js", import.meta.url));
const defaultAdapterModule = () => fileURLToPath(new URL("../adapters/index.js", import.meta.url));

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readState(path: string): SessionState | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SessionState;
  } catch {
    return undefined;
  }
}

function removeSession(home: BridgeHome, agent: string, provider: string): void {
  const paths = sessionPaths(home, agent, provider);
  rmSync(paths.state, { force: true });
  rmSync(paths.socket, { force: true });
}

/** Returns the live session state, removing stale files whose runner is gone. */
function liveState(home: BridgeHome, agent: string, provider: string): SessionState | undefined {
  const state = readState(sessionPaths(home, agent, provider).state);
  if (!state) return undefined;
  if (typeof state.pid !== "number" || !isAlive(state.pid)) {
    removeSession(home, agent, provider);
    return undefined;
  }
  return state;
}

export async function loginInProgress(
  agent: string,
  provider: string,
  home: BridgeHome,
): Promise<boolean> {
  return liveState(home, agent, provider) !== undefined;
}

export async function cancelLogin(
  agent: string,
  provider: string,
  home: BridgeHome,
): Promise<void> {
  const state = liveState(home, agent, provider);
  if (state) {
    try {
      process.kill(state.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
    const deadline = Date.now() + 3000;
    while (isAlive(state.pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (isAlive(state.pid)) process.kill(state.pid, "SIGKILL");
    // The runner stops its CLI on SIGTERM; make sure it is gone if the runner was killed.
    if (typeof state.cliPid === "number") signalGroup(state.cliPid, "SIGKILL");
  }
  removeSession(home, agent, provider);
}

export async function startLogin(args: {
  adapter: Adapter;
  provider: LoginProvider;
  home: BridgeHome;
  env: NodeJS.ProcessEnv;
  promptTimeoutMs?: number;
  idleTimeoutMs?: number;
  runnerPath?: string;
  adapterModule?: string;
}): Promise<StartResult> {
  const { adapter, provider, home } = args;
  await cancelLogin(adapter.id, provider.id, home);
  mkdirSync(dirname(sessionPaths(home, adapter.id, provider.id).state), {
    recursive: true,
    mode: 0o700,
  });

  const config: RunnerConfig = {
    agent: adapter.id,
    provider: provider.id,
    adapterModule: args.adapterModule ?? defaultAdapterModule(),
    home,
    promptTimeoutMs: args.promptTimeoutMs ?? DEFAULT_PROMPT_TIMEOUT_MS,
    idleTimeoutMs: args.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
  };
  const child = spawn(
    process.execPath,
    [
      args.runnerPath ?? defaultRunnerPath(),
      Buffer.from(JSON.stringify(config)).toString("base64"),
    ],
    { detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"], env: args.env },
  );

  return new Promise<StartResult>((resolve) => {
    const finish = (result: StartResult) => {
      child.removeAllListeners();
      if (child.connected) child.disconnect();
      child.unref();
      resolve(result);
    };
    child.on("message", (message) => finish(message as StartResult));
    child.on("exit", (code) =>
      finish({ ok: false, error: `The login process exited unexpectedly (code ${code}).` }),
    );
    child.on("error", (error) => finish({ ok: false, error: error.message }));
  });
}

export async function completeLogin(args: {
  agent: string;
  provider: string;
  home: BridgeHome;
  response?: string;
  timeoutMs?: number;
}): Promise<CompleteResult> {
  const state = liveState(args.home, args.agent, args.provider);
  if (!state) return { status: "no-session" };
  const timeoutMs = args.timeoutMs ?? COMPLETE_TIMEOUT_MS[state.strategy];
  const socketPath = sessionPaths(args.home, args.agent, args.provider).socket;

  return new Promise<CompleteResult>((resolve) => {
    let buffer = "";
    let settled = false;
    const socket = createConnection(socketPath);
    const finish = (result: CompleteResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish({
          status: "done",
          ok: false,
          message: "Timed out waiting for the login to finish. Run `bridge complete` again.",
        }),
      timeoutMs + 5000,
    );
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ type: "complete", response: args.response, timeoutMs })}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline >= 0) finish(JSON.parse(buffer.slice(0, newline)) as CompleteResult);
    });
    socket.on("error", () => finish({ status: "no-session" }));
    socket.on("close", () =>
      finish({
        status: "done",
        ok: false,
        message:
          "The login process ended before reporting a result. Start again with `bridge login`.",
      }),
    );
  });
}
