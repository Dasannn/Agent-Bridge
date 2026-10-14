import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { type Main, main } from "../../src/cli/main.js";
import { type Adapter, createRegistry } from "../../src/core/adapter.js";
import { resolveHome } from "../../src/core/paths.js";
import { cancelLogin } from "../../src/core/session.js";
// @ts-expect-error plain JavaScript test helper
import { adapters as fakeAdapters } from "../helpers/fake-adapter.mjs";

const fake = (fakeAdapters as Adapter[])[0];
const runnerPath = fileURLToPath(new URL("../../dist/core/runner.js", import.meta.url));
const adapterModule = fileURLToPath(new URL("../helpers/fake-adapter.mjs", import.meta.url));

const nodeAdapter: Adapter = {
  id: "node",
  displayName: "Node",
  binaries: [process.execPath],
  requiresLogin: false,
  providers: [],
  isInstalled: async () => true,
  install: async () => {},
  delegationExample: "node -e ...",
};
const claudeAdapter: Adapter = { ...nodeAdapter, id: "claude", displayName: "Claude Code" };
const missingAdapter: Adapter = {
  ...nodeAdapter,
  id: "missing",
  requiresLogin: true,
  isInstalled: async () => false,
  install: async () => {
    throw new Error("npm could not install missing-cli:\nE404 Not Found");
  },
};
let lateInstalled = false;
// Same id as the fake adapter, because the session runner loads it by id.
const lateAdapter: Adapter = {
  ...fake,
  isInstalled: async () => lateInstalled,
  install: async () => {
    lateInstalled = true;
  },
};

const envs: NodeJS.ProcessEnv[] = [];

function setup(extra: NodeJS.ProcessEnv = {}, adapters?: Adapter[]) {
  const dir = mkdtempSync(join(tmpdir(), "ab-cmd-"));
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: dir,
    AGENT_BRIDGE_HOME: join(dir, "bridge"),
    ...extra,
  };
  envs.push(env);
  const out = { stdout: "", stderr: "" };
  const io = {
    stdout: (t: string) => {
      out.stdout += t;
    },
    stderr: (t: string) => {
      out.stderr += t;
    },
  };
  const deps: Parameters<Main>[2] = {
    env,
    registry: createRegistry(adapters ?? [fake, nodeAdapter, claudeAdapter, missingAdapter]),
    runnerPath,
    adapterModule,
  };
  const run = (...argv: string[]) => main(argv, io, deps);
  return { env, out, run };
}

afterEach(async () => {
  for (const env of envs.splice(0)) {
    const home = resolveHome(env);
    for (const p of fake.providers) await cancelLogin("fake", p.id, home);
  }
});

describe("short flags", () => {
  it("-h prints help and -v prints the version", async () => {
    const { out, run } = setup();
    expect(await run("-h")).toBe(0);
    expect(out.stdout).toContain("Usage: bridge <command>");
    expect(await run("-v")).toBe(0);
    expect(out.stdout).toMatch(/\d+\.\d+\.\d+\n$/);
  });
});

describe("login and complete", () => {
  it("logs in with a pasted code", async () => {
    const { out, run } = setup();
    expect(await run("login", "fake", "--provider", "paste")).toBe(0);
    expect(out.stdout).toContain("https://example.test/auth?state=s1");
    expect(out.stdout).toMatch(/paste the code/i);
    expect(out.stdout).toContain("bridge complete fake --provider paste");
    expect(await run("complete", "fake", "--provider", "paste", "GOOD-CODE")).toBe(0);
    expect(out.stdout).toContain("Signed in to Fake CLI");
  });

  it("shows the device code to enter", async () => {
    const { out, run } = setup();
    expect(await run("login", "fake", "--provider", "device")).toBe(0);
    expect(out.stdout).toContain("https://example.test/device");
    expect(out.stdout).toContain("ABCD-1234");
    expect(await run("complete", "fake", "--provider", "device")).toBe(0);
  });

  it("reports already authenticated", async () => {
    const { out, run } = setup();
    await run("login", "fake", "--provider", "device");
    await run("complete", "fake", "--provider", "device");
    expect(await run("login", "fake", "--provider", "device")).toBe(0);
    expect(out.stdout).toMatch(/already authenticated/i);
  });

  it("asks for a provider when several exist", async () => {
    const { out, run } = setup();
    expect(await run("login", "fake")).toBe(1);
    expect(out.stderr).toContain("--provider");
    expect(out.stderr).toContain("paste");
  });

  it("rejects an invalid pasted code without ending the login", async () => {
    const { out, run } = setup();
    await run("login", "fake", "--provider", "paste");
    expect(await run("complete", "fake", "--provider", "paste", "")).toBe(1);
    expect(out.stderr).toMatch(/paste/i);
    expect(await run("complete", "fake", "--provider", "paste", "GOOD-CODE")).toBe(0);
  });

  it("accepts a code starting with a dash after --", async () => {
    const { run } = setup();
    await run("login", "fake", "--provider", "paste");
    expect(await run("complete", "fake", "--provider", "paste", "--", "-GOOD-CODE")).toBe(0);
  });

  it("reports a wrong code without echoing it", async () => {
    const { out, run } = setup();
    await run("login", "fake", "--provider", "paste");
    expect(await run("complete", "fake", "--provider", "paste", "WRONG-SECRET-9")).toBe(1);
    expect(out.stderr).toContain("Invalid code");
    expect(out.stdout + out.stderr).not.toContain("WRONG-SECRET-9");
  });

  it("completes the only login in progress when no agent is named", async () => {
    const { out, run } = setup();
    await run("login", "fake", "--provider", "paste");
    expect(await run("complete", "GOOD-CODE")).toBe(0);
    expect(out.stdout).toContain("Signed in to Fake CLI");
  });

  it("accepts a dash code after -- when no agent is named", async () => {
    const { run } = setup();
    await run("login", "fake", "--provider", "paste");
    expect(await run("complete", "--", "-GOOD-CODE")).toBe(0);
  });

  it("asks for the agent when several logins are in progress", async () => {
    const { out, run } = setup();
    await run("login", "fake", "--provider", "paste");
    await run("login", "fake", "--provider", "device");
    expect(await run("complete", "GOOD-CODE")).toBe(1);
    expect(out.stderr).toMatch(/several logins/i);
    expect(out.stderr).toContain("fake --provider paste");
    expect(out.stderr).toContain("fake --provider device");
    expect(out.stderr).not.toContain("GOOD-CODE");
  });

  it("complete without agent or login explains the next step", async () => {
    const { out, run } = setup();
    expect(await run("complete", "SOME-CODE")).toBe(1);
    expect(out.stderr).toMatch(/no login is in progress/i);
    expect(out.stderr).toContain("bridge login <agent>");
    expect(out.stderr).not.toContain("SOME-CODE");
  });

  it("complete without login explains the next step", async () => {
    const { out, run } = setup();
    expect(await run("complete", "fake", "--provider", "paste", "X")).toBe(1);
    expect(out.stderr).toContain("bridge login fake");
  });

  it("explains a login that shows no prompt, including the network hint", async () => {
    const { out, run } = setup({ AGENT_BRIDGE_PROMPT_TIMEOUT_MS: "500" });
    expect(await run("login", "fake", "--provider", "silent")).toBe(1);
    expect(out.stderr).toMatch(/no login prompt/i);
    expect(out.stderr).toMatch(/network policy/i);
  });

  it("reports an install failure with the installer's output", async () => {
    const { out, run } = setup();
    expect(await run("login", "missing")).toBe(1);
    expect(out.stderr).toMatch(/could not install/i);
    expect(out.stderr).toContain("E404 Not Found");
  });

  it("installs a missing CLI before logging in", async () => {
    lateInstalled = false;
    const { out, run } = setup({}, [lateAdapter]);
    expect(await run("login", "fake", "--provider", "device")).toBe(0);
    expect(lateInstalled).toBe(true);
    expect(out.stdout).toContain("ABCD-1234");
  });
});

describe("portable home", () => {
  it("logs in when the real home directory is unusable", async () => {
    const { out, run } = setup({ HOME: "/nonexistent-agent-bridge-home" });
    expect(await run("login", "fake", "--provider", "paste")).toBe(0);
    expect(await run("complete", "fake", "--provider", "paste", "GOOD-CODE")).toBe(0);
    expect(out.stdout).toContain("Signed in to Fake CLI");
  });
});

describe("host agent", () => {
  it("refuses to log in, log out, or run the host", async () => {
    const { out, run } = setup({ CLAUDECODE: "1" });
    expect(await run("login", "claude")).toBe(1);
    expect(await run("logout", "claude")).toBe(1);
    expect(await run("run", "claude", "--", "-e", "0")).toBe(1);
    expect(out.stderr).toMatch(/running inside Claude Code/i);
  });

  it("reports the host in status", async () => {
    const { out, run } = setup({ CLAUDECODE: "1" });
    expect(await run("status", "claude")).toBe(0);
    expect(out.stdout).toMatch(/claude: host/);
  });
});

describe("status", () => {
  it("reports each adapter", async () => {
    const { out, run } = setup();
    expect(await run("status")).toBe(0);
    expect(out.stdout).toMatch(/fake: .*paste: not authenticated/);
    expect(out.stdout).toMatch(/node: ready \(no login needed\)/);
    expect(out.stdout).toMatch(/missing: not installed/);
  });

  it("reports a login in progress", async () => {
    const { out, run } = setup();
    await run("login", "fake", "--provider", "paste");
    await run("status", "fake");
    expect(out.stdout).toMatch(/paste: login in progress/);
  });

  it("supports --json", async () => {
    const { out, run } = setup();
    expect(await run("status", "node", "--json")).toBe(0);
    const parsed = JSON.parse(out.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.agents[0]).toMatchObject({ id: "node", state: "ready (no login needed)" });
  });
});

describe("logout", () => {
  it("signs out and verifies", async () => {
    const { out, run } = setup();
    await run("login", "fake", "--provider", "device");
    await run("complete", "fake", "--provider", "device");
    expect(await run("logout", "fake", "--provider", "device")).toBe(0);
    expect(out.stdout).toMatch(/signed out/i);
    await run("status", "fake");
    expect(out.stdout).toMatch(/device: not authenticated/);
  });
});

describe("run", () => {
  it("passes arguments after -- and returns the exit code", async () => {
    const { run } = setup();
    expect(await run("run", "node", "--", "-e", "process.exit(3)")).toBe(3);
  });

  it("uses the managed environment", async () => {
    const { env, run } = setup();
    const file = join(env.HOME as string, "path.txt");
    const script = `require("fs").writeFileSync(${JSON.stringify(file)}, process.env.PATH)`;
    expect(await run("run", "node", "--", "-e", script)).toBe(0);
    expect(readFileSync(file, "utf8").split(":")[0]).toBe(
      join(env.AGENT_BRIDGE_HOME as string, "prefix", "bin"),
    );
  });
});

describe("errors", () => {
  it("rejects unknown agents and lists known ones", async () => {
    const { out, run } = setup();
    expect(await run("login", "nope")).toBe(1);
    expect(out.stderr).toContain("Unknown agent: nope");
    expect(out.stderr).toContain("fake");
  });

  it("marks setup and skill as not implemented", async () => {
    const { out, run } = setup();
    expect(await run("setup")).toBe(1);
    expect(await run("skill")).toBe(1);
    expect(out.stderr).toMatch(/not implemented yet/i);
  });
});
