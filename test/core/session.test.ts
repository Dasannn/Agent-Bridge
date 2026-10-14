import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { Adapter } from "../../src/core/adapter.js";
import { type BridgeHome, sessionPaths } from "../../src/core/paths.js";
import { cancelLogin, completeLogin, loginInProgress, startLogin } from "../../src/core/session.js";
// @ts-expect-error plain JavaScript test helper
import { adapters } from "../helpers/fake-adapter.mjs";

const fake = (adapters as Adapter[])[0];
const provider = (id: string) => {
  const found = fake.providers.find((p) => p.id === id);
  if (!found) throw new Error(id);
  return found;
};
const runnerPath = fileURLToPath(new URL("../../dist/core/runner.js", import.meta.url));
const adapterModule = fileURLToPath(new URL("../helpers/fake-adapter.mjs", import.meta.url));

const started: Array<{ provider: string; home: BridgeHome }> = [];

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "ab-sess-"));
  const home: BridgeHome = { root: join(dir, "bridge"), portable: false };
  const env = { ...process.env, HOME: dir };
  return { home, env };
}

async function start(id: string, promptTimeoutMs = 10_000) {
  const { home, env } = setup();
  started.push({ provider: id, home });
  const result = await startLogin({
    adapter: fake,
    provider: provider(id),
    home,
    env,
    promptTimeoutMs,
    runnerPath,
    adapterModule,
  });
  return { home, env, result };
}

const complete = (home: BridgeHome, id: string, response?: string) =>
  completeLogin({ agent: "fake", provider: id, home, response, timeoutMs: 10_000 });

afterEach(async () => {
  for (const s of started.splice(0)) await cancelLogin("fake", s.provider, s.home);
});

describe("session runner", () => {
  it("paste-code login succeeds with the right code", async () => {
    const { home, env, result } = await start("paste");
    expect(result).toEqual({ ok: true, prompt: { url: "https://example.test/auth?state=s1" } });
    const done = await complete(home, "paste", "GOOD-CODE");
    expect(done).toMatchObject({ status: "done", ok: true });
    expect(await provider("paste").isAuthenticated(env)).toBe(true);
    expect(await loginInProgress("fake", "paste", home)).toBe(false);
  });

  it("rejects an empty response and keeps the login alive", async () => {
    const { home } = await start("paste");
    expect(await complete(home, "paste", "  ")).toMatchObject({ status: "rejected" });
    expect(await loginInProgress("fake", "paste", home)).toBe(true);
    expect(await complete(home, "paste", "GOOD-CODE")).toMatchObject({ status: "done", ok: true });
  });

  it("reports the CLI error for a wrong code", async () => {
    const { home } = await start("paste");
    const done = await complete(home, "paste", "WRONG-1");
    expect(done).toMatchObject({ status: "done", ok: false });
    expect(done.status === "done" && done.message).toContain("Invalid code");
  });

  it("device-code login completes without a response", async () => {
    const { home, env, result } = await start("device");
    expect(result).toEqual({
      ok: true,
      prompt: { url: "https://example.test/device", code: "ABCD-1234" },
    });
    expect(await complete(home, "device")).toMatchObject({ status: "done", ok: true });
    expect(await provider("device").isAuthenticated(env)).toBe(true);
  });

  it("device-code failure is reported", async () => {
    const { home } = await start("denied");
    const done = await complete(home, "denied");
    expect(done).toMatchObject({ status: "done", ok: false });
    expect(done.status === "done" && done.message).toContain("Denied");
  });

  it("silent CLI times out with its raw screen", async () => {
    const { home, result } = await start("silent", 500);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/no login prompt/i);
    expect(await loginInProgress("fake", "silent", home)).toBe(false);
  });

  it("completeLogin without a session returns no-session", async () => {
    const { home } = setup();
    expect(await complete(home, "paste", "GOOD-CODE")).toEqual({ status: "no-session" });
  });

  it("a second startLogin stops the first runner", async () => {
    const { home, env } = await start("paste");
    const first = JSON.parse(readFileSync(sessionPaths(home, "fake", "paste").state, "utf8"));
    const again = await startLogin({
      adapter: fake,
      provider: provider("paste"),
      home,
      env,
      runnerPath,
      adapterModule,
    });
    expect(again.ok).toBe(true);
    expect(() => process.kill(first.pid, 0)).toThrow();
    expect(await complete(home, "paste", "GOOD-CODE")).toMatchObject({ status: "done", ok: true });
  });

  it("stale state file is cleaned up", async () => {
    const { home } = setup();
    const paths = sessionPaths(home, "fake", "paste");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(home.root, "sessions"), { recursive: true });
    writeFileSync(paths.state, JSON.stringify({ pid: 2 ** 22 + 12345, strategy: "paste-code" }));
    expect(await loginInProgress("fake", "paste", home)).toBe(false);
    expect(existsSync(paths.state)).toBe(false);
    expect(await complete(home, "paste", "x")).toEqual({ status: "no-session" });
  });

  it("state file never contains the response", async () => {
    const { home } = await start("paste");
    const state = sessionPaths(home, "fake", "paste").state;
    expect(await complete(home, "paste", "a b")).toMatchObject({ status: "rejected" });
    expect(readFileSync(state, "utf8")).not.toContain("a b");
  });

  it("failure messages never echo the pasted code", async () => {
    const { home } = await start("paste");
    const done = await complete(home, "paste", "WRONG-SECRET-9");
    expect(JSON.stringify(done)).not.toContain("WRONG-SECRET-9");
  });
});
