// Session runner: a detached process that owns one CLI login between
// `bridge login` and `bridge complete` (ARCHITECTURE.md, Session runner).
import { rmSync, writeFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { pathToFileURL } from "node:url";
import type { Adapter, LoginPrompt, LoginProvider } from "./adapter.js";
import { mask } from "./output.js";
import { sessionPaths } from "./paths.js";
import type { CompleteResult, RunnerConfig, SessionState, StartResult } from "./session.js";
import { validateResponse } from "./strategies.js";
import { spawnTerminal, type Terminal } from "./terminal.js";

const KEY_DELAY_MS = 300;
const SCREEN_TAIL_LINES = 15;

const config = JSON.parse(
  Buffer.from(process.argv[2] ?? "", "base64").toString("utf8"),
) as RunnerConfig;
const paths = sessionPaths(config.home, config.agent, config.provider);

function report(result: StartResult): void {
  process.send?.(result);
  process.disconnect?.();
}

function tail(screen: string, secrets: string[] = []): string {
  return mask(screen.split("\n").slice(-SCREEN_TAIL_LINES).join("\n").trim(), secrets);
}

function cleanup(): void {
  rmSync(paths.state, { force: true });
  rmSync(paths.socket, { force: true });
}

async function loadProvider(): Promise<{ adapter: Adapter; provider: LoginProvider }> {
  const module = (await import(pathToFileURL(config.adapterModule).href)) as {
    adapters: Adapter[];
  };
  const adapter = module.adapters.find((a) => a.id === config.agent);
  const provider = adapter?.providers.find((p) => p.id === config.provider);
  if (!adapter || !provider) throw new Error(`Unknown agent ${config.agent}/${config.provider}`);
  return { adapter, provider };
}

async function waitForPrompt(
  terminal: Terminal,
  provider: LoginProvider,
): Promise<LoginPrompt | undefined> {
  const deadline = Date.now() + config.promptTimeoutMs;
  if (provider.keys?.length) {
    await terminal.waitFor((screen) => screen.trim().length > 0, config.promptTimeoutMs);
    for (const key of provider.keys) {
      await new Promise((resolve) => setTimeout(resolve, KEY_DELAY_MS));
      terminal.write(key);
    }
  }
  let prompt: LoginPrompt | undefined;
  await terminal.waitFor(
    (screen) => {
      prompt = provider.parsePrompt(screen);
      return prompt !== undefined;
    },
    Math.max(0, deadline - Date.now()),
  );
  return prompt;
}

async function main(): Promise<void> {
  const { provider } = await loadProvider();
  const env = process.env;
  const [command, ...args] = provider.command;
  const terminal = spawnTerminal(command, args, { env, cwd: env.HOME ?? process.cwd() });

  let exitCode: number | undefined;
  terminal.exited.then((code) => {
    exitCode = code;
  });

  const shutdown = (code = 0) => {
    terminal.kill();
    cleanup();
    process.exit(code);
  };
  process.on("SIGTERM", () => shutdown(0));
  process.on("SIGINT", () => shutdown(0));

  const prompt = await waitForPrompt(terminal, provider);
  if (!prompt) {
    const error =
      exitCode === undefined
        ? "The CLI showed no login prompt in time."
        : `The CLI exited (code ${exitCode}) before showing a login prompt.`;
    report({ ok: false, error, screen: tail(terminal.screen()) });
    shutdown(1);
    return;
  }

  const state: SessionState = {
    pid: process.pid,
    agent: config.agent,
    provider: config.provider,
    strategy: provider.strategy,
    prompt,
    startedAt: new Date().toISOString(),
  };

  let completing = false;
  const idle = setTimeout(() => shutdown(0), config.idleTimeoutMs);

  async function finishLogin(timeoutMs: number, secrets: string[]): Promise<CompleteResult> {
    const code = await Promise.race([
      terminal.exited,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);
    if (code === undefined) {
      return { status: "done", ok: false, message: "Timed out waiting for the CLI to finish." };
    }
    const authenticated = await provider.isAuthenticated(env);
    if (code === 0 && authenticated) {
      return { status: "done", ok: true, message: "Signed in." };
    }
    return {
      status: "done",
      ok: false,
      message: `Login failed (exit code ${code}).\n${tail(terminal.screen(), secrets)}`,
    };
  }

  function reply(socket: Socket, result: CompleteResult): void {
    socket.end(`${JSON.stringify(result)}\n`);
  }

  const server = createServer((socket) => {
    let buffer = "";
    socket.on("data", async (chunk) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const request = JSON.parse(buffer.slice(0, newline)) as {
        response?: string;
        timeoutMs: number;
      };
      if (completing) {
        reply(socket, { status: "rejected", error: "A completion is already in progress." });
        return;
      }
      const validation = validateResponse(provider.strategy, request.response);
      if (!validation.ok) {
        reply(socket, { status: "rejected", error: validation.error });
        return;
      }
      completing = true;
      clearTimeout(idle);
      if (validation.value !== undefined) terminal.write(`${validation.value}\r`);
      const result = await finishLogin(
        request.timeoutMs,
        validation.value ? [validation.value] : [],
      );
      reply(socket, result);
      server.close();
      shutdown(0);
    });
  });

  rmSync(paths.socket, { force: true });
  server.listen(paths.socket, () => {
    writeFileSync(paths.state, JSON.stringify(state), { mode: 0o600 });
    report({ ok: true, prompt });
  });
}

main().catch((error: unknown) => {
  report({ ok: false, error: error instanceof Error ? error.message : String(error) });
  cleanup();
  process.exit(1);
});
