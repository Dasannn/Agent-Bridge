// Session runner: a detached process that owns one CLI login between
// `bridge login` and `bridge complete` (ARCHITECTURE.md, Session runner).
import { rmSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { createServer, type Socket } from "node:net";
import { pathToFileURL } from "node:url";
import {
  type Adapter,
  type LoginMethod,
  type LoginPrompt,
  type LoginProvider,
  loginMethod,
} from "./adapter.js";
import { mask } from "./output.js";
import { sessionPaths } from "./paths.js";
import type { CompleteResult, RunnerConfig, SessionState, StartResult } from "./session.js";
import { callbackTarget, validateResponse } from "./strategies.js";
import { spawnTerminal, type Terminal } from "./terminal.js";

const KEY_DELAY_MS = 300;
const AUTH_POLL_MS = 2000;
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

/** Delivers the pasted callback to the CLI's listener on the loopback interface. */
type Delivery = { ok: true } | { ok: false; error: string; status?: number };

function deliverCallback(port: number, path: string): Promise<Delivery> {
  return new Promise((resolve) => {
    const request = get({ host: "127.0.0.1", port, path, timeout: 15_000 }, (response) => {
      response.resume();
      response.on("end", () => {
        const status = response.statusCode ?? 0;
        resolve(status >= 400 ? { ok: false, error: `HTTP ${status}`, status } : { ok: true });
      });
    });
    request.on("timeout", () => request.destroy(new Error("no answer")));
    request.on("error", (error) =>
      resolve({ ok: false, error: (error as NodeJS.ErrnoException).code ?? error.message }),
    );
  });
}

// After a rejected callback, how long to let the CLI print its own error.
const REJECTION_GRACE_MS = 2000;

async function waitForPrompt(
  terminal: Terminal,
  provider: LoginMethod,
): Promise<LoginPrompt | undefined> {
  const deadline = Date.now() + config.promptTimeoutMs;
  for (const step of provider.keys ?? []) {
    const seen = await terminal.waitFor(
      (screen) => screen.includes(step.after),
      Math.max(0, deadline - Date.now()),
    );
    if (!seen) return undefined;
    // Let the TUI finish drawing before it receives input.
    await new Promise((resolve) => setTimeout(resolve, KEY_DELAY_MS));
    terminal.write(step.send);
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
  const chosen = loginMethod(provider, config.device);
  if (!chosen) {
    report({ ok: false, error: "This login has no device-code alternative." });
    cleanup();
    process.exit(1);
  }
  const method: LoginMethod = chosen;
  const env = process.env;
  const [command, ...args] = method.command;
  const terminal = spawnTerminal(command, args, { env, cwd: env.HOME ?? process.cwd() });

  let exitCode: number | undefined;
  terminal.exited.then((code) => {
    exitCode = code;
  });

  const shutdown = async (code = 0) => {
    await terminal.kill();
    cleanup();
    process.exit(code);
  };
  process.on("SIGTERM", () => void shutdown(0));
  process.on("SIGINT", () => void shutdown(0));

  const prompt = await waitForPrompt(terminal, method);
  if (!prompt) {
    const error =
      exitCode === undefined
        ? "The CLI showed no login prompt in time."
        : `The CLI exited (code ${exitCode}) before showing a login prompt.`;
    report({ ok: false, error, screen: tail(terminal.screen()) });
    await shutdown(1);
    return;
  }

  const state: SessionState = {
    pid: process.pid,
    cliPid: terminal.pid,
    agent: config.agent,
    provider: config.provider,
    strategy: method.strategy,
    prompt,
    startedAt: new Date().toISOString(),
  };

  // One completion per login. Later `complete` calls (for example a retry after
  // the agent's own timeout) wait for the same result instead of being refused.
  let result: Promise<CompleteResult> | undefined;
  let lingering: NodeJS.Timeout | undefined;
  const idle = setTimeout(() => void shutdown(0), config.idleTimeoutMs);

  /**
   * Waits until the CLI exits or reports a signed-in account. Some CLIs
   * (Antigravity) stay open after a successful login, so exiting is not required.
   */
  async function finishLogin(timeoutMs: number, secrets: string[]): Promise<CompleteResult> {
    const failure = (code: number): CompleteResult => ({
      status: "done",
      ok: false,
      message: `Login failed (exit code ${code}).\n${tail(terminal.screen(), secrets)}`,
    });
    try {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const code = await Promise.race([
          terminal.exited,
          new Promise<undefined>((resolve) =>
            setTimeout(() => resolve(undefined), Math.min(AUTH_POLL_MS, deadline - Date.now())),
          ),
        ]);
        if (code !== undefined) {
          return code === 0 && (await provider.isAuthenticated(env))
            ? { status: "done", ok: true, message: "Signed in." }
            : failure(code);
        }
        if (await provider.isAuthenticated(env)) {
          return { status: "done", ok: true, message: "Signed in." };
        }
      }
      return { status: "done", ok: false, message: "Timed out waiting for the CLI to finish." };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { status: "done", ok: false, message: mask(`Login check failed: ${reason}`, secrets) };
    }
  }

  const connected = (socket: Socket) => !socket.destroyed && socket.writable;

  function reply(socket: Socket, message: CompleteResult): void {
    if (connected(socket)) socket.end(`${JSON.stringify(message)}\n`);
  }

  function parseRequest(line: string): { response?: string; timeoutMs: number } | undefined {
    try {
      const request = JSON.parse(line) as { response?: unknown; timeoutMs?: unknown };
      return {
        response: typeof request.response === "string" ? request.response : undefined,
        timeoutMs: typeof request.timeoutMs === "number" ? request.timeoutMs : 120_000,
      };
    } catch {
      return undefined;
    }
  }

  async function handle(socket: Socket, line: string): Promise<void> {
    if (!result) {
      const request = parseRequest(line);
      if (!request) {
        reply(socket, { status: "rejected", error: "Malformed request." });
        return;
      }
      let input = request.response;
      if (input !== undefined && provider.normalizeResponse) {
        input = provider.normalizeResponse(input.trim());
        if (input === undefined) {
          reply(socket, {
            status: "rejected",
            error:
              "That is not something this login accepts. Paste only the code shown in the browser.",
          });
          return;
        }
      }
      const validation = validateResponse(method.strategy, input, prompt);
      if (!validation.ok) {
        reply(socket, { status: "rejected", error: validation.error });
        return;
      }
      clearTimeout(idle);
      const secrets = [request.response?.trim(), validation.value].filter(
        (secret): secret is string => Boolean(secret),
      );
      const target = callbackTarget(prompt);
      if (method.strategy === "loopback-callback" && target && validation.value !== undefined) {
        const timeoutMs = request.timeoutMs;
        const path = validation.value;
        result = deliverCallback(target.port, path).then(async (delivery) => {
          if (delivery.ok) return finishLogin(timeoutMs, secrets);
          if (delivery.status === undefined) {
            return {
              status: "done" as const,
              ok: false,
              message: `The CLI is no longer waiting for the browser (${delivery.error}).`,
            };
          }
          await Promise.race([
            terminal.exited,
            new Promise((resolve) => setTimeout(resolve, REJECTION_GRACE_MS)),
          ]);
          return {
            status: "done" as const,
            ok: false,
            message: `The CLI rejected the sign-in (${delivery.error}).\n${tail(terminal.screen(), secrets)}`,
          };
        });
      } else {
        if (validation.value !== undefined) terminal.write(`${validation.value}\r`);
        result = finishLogin(request.timeoutMs, secrets);
      }
    }
    const outcome = await result;
    if (connected(socket)) {
      // The session is over once someone receives the result: remove it first,
      // so the caller never sees a finished login as still in progress.
      cleanup();
      reply(socket, outcome);
      setTimeout(() => void shutdown(0), 200);
    } else if (!lingering) {
      // Nobody was listening: keep the result for a later `complete`.
      lingering = setTimeout(() => void shutdown(0), config.idleTimeoutMs);
    }
  }

  const server = createServer((socket) => {
    let buffer = "";
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      buffer = "";
      void handle(socket, line);
    });
  });
  server.on("error", (error) => {
    report({ ok: false, error: `Could not open the login session: ${error.message}` });
    void shutdown(1);
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
