import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spawnTerminal } from "../../src/core/terminal.js";

const fakeCli = new URL("../fake-cli/fake-cli.mjs", import.meta.url).pathname;
const env = () => ({ ...process.env, HOME: mkdtempSync(join(tmpdir(), "ab-term-")) });
const start = (mode: string, cols?: number) =>
  spawnTerminal(process.execPath, [fakeCli, mode], { env: env(), cwd: tmpdir(), cols });

describe("spawnTerminal", () => {
  it("answers terminal queries so the fake CLI draws", async () => {
    const term = start("paste-code");
    expect(await term.waitFor((s) => s.includes("Paste code:"), 5000)).toBe(true);
    term.kill();
  });

  it("delivers written input", async () => {
    const term = start("paste-code");
    await term.waitFor((s) => s.includes("Paste code:"), 5000);
    term.write("GOOD-CODE\r");
    expect(await term.exited).toBe(0);
    expect(term.screen()).toContain("Signed in");
  });

  it("screen joins wrapped lines", async () => {
    const term = start("long-url", 80);
    const url = `https://example.test/${"x".repeat(300)}`;
    expect(await term.waitFor((s) => s.includes(url), 5000)).toBe(true);
    term.kill();
  });

  it("visible shows only the live screen, not the scrollback", async () => {
    const term = spawnTerminal(
      process.execPath,
      ["-e", "for (let i = 1; i <= 60; i++) console.log('line ' + i)"],
      { env: env(), cwd: tmpdir(), rows: 10 },
    );
    await term.exited;
    expect(term.screen()).toContain("line 1\n");
    expect(term.visible()).not.toContain("line 1\n");
    expect(term.visible()).toContain("line 60");
  });

  it("reports the exit code", async () => {
    const term = start("paste-code");
    await term.waitFor((s) => s.includes("Paste code:"), 5000);
    term.write("BAD\r");
    expect(await term.exited).toBe(1);
  });

  it("waitFor returns false on timeout", async () => {
    const term = start("silent");
    expect(await term.waitFor((s) => s.includes("never"), 300)).toBe(false);
    term.kill();
  });

  it("kill stops a process that ignores hangup and termination", async () => {
    const term = start("stubborn");
    await term.waitFor((s) => s.includes("Paste code:"), 5000);
    await term.kill();
    expect(() => process.kill(term.pid, 0)).toThrow();
  });

  it("kill stops the process", async () => {
    const term = start("silent");
    await term.kill();
    await term.exited;
    expect(() => process.kill(term.pid, 0)).toThrow();
  });
});
