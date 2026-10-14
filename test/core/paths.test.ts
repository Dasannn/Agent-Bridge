import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { managedEnv, resolveHome, sessionPaths } from "../../src/core/paths.js";

const temp = () => mkdtempSync(join(tmpdir(), "ab-paths-"));
const writable = () => true;
const readOnly = () => false;

describe("resolveHome", () => {
  it("uses AGENT_BRIDGE_HOME when set", () => {
    const root = join(temp(), "bridge");
    const home = resolveHome({ AGENT_BRIDGE_HOME: root, HOME: temp() }, writable);
    expect(home).toEqual({ root, portable: false });
  });

  it("marks AGENT_BRIDGE_HOME portable when HOME is read-only", () => {
    const root = join(temp(), "bridge");
    expect(resolveHome({ AGENT_BRIDGE_HOME: root, HOME: temp() }, readOnly).portable).toBe(true);
  });

  it("uses ~/.agent-bridge when home is writable", () => {
    const h = temp();
    expect(resolveHome({ HOME: h }, writable)).toEqual({
      root: join(h, ".agent-bridge"),
      portable: false,
    });
  });

  it("falls back to the temp directory when home is read-only", () => {
    const t = temp();
    expect(resolveHome({ HOME: temp(), TMPDIR: t }, readOnly)).toEqual({
      root: join(t, "agent-bridge"),
      portable: true,
    });
  });

  it("creates root with mode 0700", () => {
    const root = join(temp(), "bridge");
    resolveHome({ AGENT_BRIDGE_HOME: root, HOME: temp() }, writable);
    expect(statSync(root).mode & 0o777).toBe(0o700);
  });
});

describe("managedEnv", () => {
  const base = { HOME: "/home/u", PATH: "/usr/bin", OTHER: "x" };

  it("redirects home variables only in portable mode", () => {
    const portable = managedEnv(base, { root: "/tmp/ab", portable: true });
    expect(portable.HOME).toBe("/tmp/ab/home");
    expect(portable.XDG_CONFIG_HOME).toBe("/tmp/ab/home/.config");
    expect(portable.XDG_DATA_HOME).toBe("/tmp/ab/home/.local/share");
    expect(portable.XDG_CACHE_HOME).toBe("/tmp/ab/home/.cache");
    expect(portable.CLAUDE_CONFIG_DIR).toBe("/tmp/ab/home/.claude");
    expect(portable.OTHER).toBe("x");

    const normal = managedEnv(base, { root: "/home/u/.agent-bridge", portable: false });
    expect(normal.HOME).toBe("/home/u");
    expect(normal.XDG_CONFIG_HOME).toBeUndefined();
    expect(normal.CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  it("prepends prefix/bin to PATH", () => {
    expect(managedEnv(base, { root: "/tmp/ab", portable: true }).PATH).toBe(
      "/tmp/ab/prefix/bin:/usr/bin",
    );
    expect(managedEnv({ HOME: "/h" }, { root: "/r", portable: false }).PATH).toBe("/r/prefix/bin");
  });

  it("does not modify the input", () => {
    const input = { ...base };
    managedEnv(input, { root: "/tmp/ab", portable: true });
    expect(input).toEqual(base);
  });
});

describe("sessionPaths", () => {
  it("places state and socket under sessions", () => {
    expect(sessionPaths({ root: "/r", portable: false }, "agy", "default")).toEqual({
      state: "/r/sessions/agy-default.json",
      socket: "/r/sessions/agy-default.sock",
    });
  });
});
