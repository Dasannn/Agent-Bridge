import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findBinary, joinedScreen, runCommand, stripAnsi } from "../../src/adapters/util.js";

describe("findBinary", () => {
  it("finds an executable on PATH and ignores non-executables", () => {
    const a = mkdtempSync(join(tmpdir(), "ab-bin-"));
    const b = mkdtempSync(join(tmpdir(), "ab-bin-"));
    writeFileSync(join(a, "tool"), "plain file");
    writeFileSync(join(b, "tool"), "#!/bin/sh\n");
    chmodSync(join(b, "tool"), 0o755);
    expect(findBinary("tool", { PATH: `${a}:${b}` })).toBe(join(b, "tool"));
    expect(findBinary("absent-tool", { PATH: `${a}:${b}` })).toBeUndefined();
    expect(findBinary("tool", {})).toBeUndefined();
  });
});

describe("runCommand", () => {
  it("returns code and output", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "console.log('out'); console.error('err'); process.exit(4)"],
      process.env,
    );
    expect(result).toEqual({ code: 4, stdout: "out\n", stderr: "err\n" });
  });

  it("times out with 124", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      process.env,
      300,
    );
    expect(result.code).toBe(124);
  });

  it("returns 127 when the command does not exist", async () => {
    expect((await runCommand("/nonexistent/cmd", [], process.env)).code).toBe(127);
  });
});

describe("stripAnsi", () => {
  it("removes colour codes", () => {
    expect(stripAnsi("\u001b[32mOpenAI\u001b[0m \u001b[90m~/x\u001b[39m")).toBe("OpenAI ~/x");
  });
});

describe("joinedScreen", () => {
  it("rebuilds a URL split across lines", () => {
    expect(joinedScreen(" https://a.test/x?y=1&z\n 2&w=3   \n Next")).toBe(
      "https://a.test/x?y=1&z2&w=3Next",
    );
  });
});
