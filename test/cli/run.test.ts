import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { observerUrl } from "../../src/cli/run-observer.js";

const fixture = fileURLToPath(new URL("../fake-cli/run.mjs", import.meta.url));
const commands = new URL("../../dist/cli/commands.js", import.meta.url).href;
const adapters = new URL("../../dist/core/adapter.js", import.meta.url).href;
const dirs: string[] = [];
const servers: Server[] = [];

async function observer(hang = false) {
  const events: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      expect(req.method).toBe("POST");
      expect(req.url).toBe("/events?run=1");
      events.push(JSON.parse(body));
      if (!hang) res.end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing observer port");
  return { events, url: `http://127.0.0.1:${address.port}/events?run=1`, server };
}

function launch(url?: string, mode = "output", stdoutDelay = 0, args: string[] = []) {
  const home = mkdtempSync(join(tmpdir(), "ab-observer-"));
  dirs.push(home);
  const script = `
    import { fstatSync } from "node:fs";
    import { run } from ${JSON.stringify(commands)};
    import { createRegistry } from ${JSON.stringify(adapters)};
    process.env.PARENT_STDOUT_INO = String(fstatSync(1).ino);
    const registry = createRegistry([{ id: "fake", binaries: [process.execPath] }]);
    process.exitCode = await run({ env: process.env, registry }, "fake",
      ${JSON.stringify([fixture, mode, ...args])}, result => console.error(result.message));
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    env: { PATH: process.env.PATH, HOME: home, AGENT_BRIDGE_EVENTS: url },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout.push(chunk);
    if (stdoutDelay) {
      child.stdout.pause();
      setTimeout(() => child.stdout.resume(), stdoutDelay);
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const result = new Promise<{ code: number | null; stdout: Buffer; stderr: string }>((resolve) => {
    child.on("close", (code) => resolve({ code, stdout: Buffer.concat(stdout), stderr }));
  });
  return { child, result };
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it("tees raw bytes and reports start, 100-line/timed batches, trailing line and exit", async () => {
  const { events, url } = await observer();
  const { result } = launch(url);
  const output = await result;
  expect(output.code).toBe(7);
  expect(output.stderr).toBe("stderr unchanged\n");
  const expected = Buffer.concat([
    Buffer.from([0, 255, 10]),
    Buffer.from(`€\r\n\n${Array.from({ length: 100 }, (_, i) => `${i}\n`).join("")}tail`),
  ]);
  expect(output.stdout).toEqual(expected);
  const start = events[0];
  expect(start).toMatchObject({ type: "start", agent: "fake", args: [fixture, "output"] });
  expect(typeof start.pid).toBe("number");
  expect(Number.isNaN(Date.parse(start.ts as string))).toBe(false);
  const batches = events.filter((e) => e.type === "lines");
  expect(batches.map((e) => (e.lines as string[]).length)).toEqual([100, 3, 1]);
  expect(batches.flatMap((e) => e.lines)).toEqual([
    "\0�",
    "€",
    "",
    ...Array.from({ length: 100 }, (_, i) => `${i}`),
    "tail",
  ]);
  expect(events.at(-1)).toMatchObject({ type: "exit", pid: start.pid, code: 7, signal: null });
});

it("silently tolerates a down observer", async () => {
  const { url, server } = await observer();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const output = await launch(url).result;
  expect(output.code).toBe(7);
  expect(output.stderr).toBe("stderr unchanged\n");
  expect(output.stdout.subarray(-4).toString()).toBe("tail");
});

it.each([512 * 1024, 1024 * 1024])(
  "preserves every byte of %i-byte stdout under slow-consumer backpressure",
  async (size) => {
    const { url } = await observer();
    const expected = Buffer.alloc(size);
    for (let i = 0; i < expected.length; i++) expected[i] = i % 256;
    const output = await launch(url, "large-output", 100, [String(size)]).result;
    expect(output.code).toBe(0);
    expect(output.stderr).toBe("");
    expect(output.stdout.length).toBe(expected.length);
    expect(output.stdout.equals(expected)).toBe(true);
  },
);

it("completes promptly without waiting for hanging observer responses", async () => {
  const { url } = await observer(true);
  const started = Date.now();
  const output = await launch(url, "hello").result;
  expect(Date.now() - started).toBeLessThan(750);
  expect(output.code).toBe(0);
  expect(output.stdout.toString()).toBe("hello\n");
  expect(output.stderr).toBe("");
});

it.each(["healthy", "down"])(
  "bounds stdout draining after target exit with a background descendant and %s observer",
  async (state) => {
    const { url, server, events } = await observer();
    if (state === "down") {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    const started = Date.now();
    const output = await launch(url, "descendant").result;
    // The descendant lives for two seconds with stdout open. It must not delay
    // either run() completion or the bridge process's natural exit.
    const elapsed = Date.now() - started;
    const pid = Number(output.stdout.toString().match(/^descendant:(\d+)\n$/)?.[1]);
    try {
      expect(elapsed).toBeLessThan(750);
      expect(output.code).toBe(7);
      expect(output.stderr).toBe("");
      expect(pid).toBeGreaterThan(0);
      if (state === "healthy") {
        expect(events.at(-1)).toMatchObject({ type: "exit", code: 7, signal: null });
      }
    } finally {
      if (pid > 0) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // The descendant may already have exited if the regression returns.
        }
      }
    }
  },
);

it.each(["healthy", "down"])(
  "uses a fixed post-exit cutoff despite continuous descendant output and %s observer",
  async (state) => {
    const { url, server, events } = await observer();
    if (state === "down") {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    const output = await launch(url, "writing-descendant").result;
    const exitAt = Number(output.stderr.match(/^exitAt:(\d+)\n$/)?.[1]);
    const elapsed = Date.now() - exitAt;
    const pid = Number(output.stdout.toString().match(/^descendant:(\d+)\n/)?.[1]);
    try {
      // Measure from the target's exit, excluding bridge/CLI startup. New
      // descendant writes must not extend the fixed 250 ms read window.
      expect(elapsed).toBeGreaterThanOrEqual(225);
      expect(elapsed).toBeLessThan(600);
      expect(output.code).toBe(7);
      expect(pid).toBeGreaterThan(0);
      expect(output.stdout.toString()).toContain("descendant output\n");
      if (state === "healthy") {
        expect(events.at(-1)).toMatchObject({ type: "exit", code: 7, signal: null });
        expect(Math.abs(Date.parse(events.at(-1)?.ts as string) - exitAt)).toBeLessThan(100);
      }
    } finally {
      if (pid > 0) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // The descendant may already have exited if the regression returns.
        }
      }
    }
  },
);

it.each([undefined, "http://192.0.2.1:1234/events"])(
  "keeps inherited stdin/stdout for %s",
  async (url) => {
    const { child, result } = launch(url, "stdio");
    child.stdin.end("input\0unchanged\n");
    expect(await result).toEqual({
      code: 0,
      stdout: Buffer.from("true\ninput\0unchanged\n"),
      stderr: "",
    });
  },
);

it.each(["127.0.0.1", "localhost"])("preserves stdin while observing through %s", async (host) => {
  const { url, events } = await observer();
  const { child, result } = launch(url.replace("127.0.0.1", host), "stdio");
  child.stdin.end("input\0unchanged\n");
  expect(await result).toEqual({
    code: 0,
    stdout: Buffer.from("false\ninput\0unchanged\n"),
    stderr: "",
  });
  expect(events.filter((event) => event.type === "lines").flatMap((event) => event.lines)).toEqual([
    "false",
    "input\0unchanged",
  ]);
});

it("forwards signals with the observer enabled", async () => {
  const { url, events } = await observer();
  const { child, result } = launch(url, "signal");
  await new Promise<void>((resolve) => child.stdout.once("data", () => resolve()));
  child.kill("SIGTERM");
  expect((await result).code).toBe(143);
  expect(events.at(-1)).toMatchObject({ type: "exit", code: null, signal: "SIGTERM" });
});

it("accepts only HTTP loopback destinations", () => {
  for (const host of ["127.0.0.1", "[::1]", "localhost"]) {
    expect(observerUrl(`http://${host}:1234/events`)).toBeDefined();
  }
  for (const value of [
    "garbage",
    "https://127.0.0.1/events",
    "http://example.com/",
    "http://127.0.0.1.example.com/",
    "http://192.0.2.1/",
    "http://user:pass@localhost/",
  ]) {
    expect(observerUrl(value)).toBeUndefined();
  }
});
