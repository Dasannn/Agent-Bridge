import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { main } from "../../src/cli/main.js";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
};

function capture() {
  const out = { stdout: "", stderr: "" };
  const io = {
    stdout: (text: string) => {
      out.stdout += text;
    },
    stderr: (text: string) => {
      out.stderr += text;
    },
  };
  return { out, io };
}

const commands = ["setup", "status", "login", "complete", "logout", "run", "skill"];

describe("main", () => {
  it("prints help for --help", async () => {
    const { out, io } = capture();
    expect(await main(["--help"], io)).toBe(0);
    expect(out.stdout).toContain("Usage: bridge <command>");
    for (const command of commands) {
      expect(out.stdout).toMatch(new RegExp(`^\\s+${command}\\b`, "m"));
    }
  });

  it("prints help with no arguments", async () => {
    const { out, io } = capture();
    expect(await main([], io)).toBe(0);
    expect(out.stdout).toContain("Usage: bridge <command>");
  });

  it("prints the package version for --version", async () => {
    const { out, io } = capture();
    expect(await main(["--version"], io)).toBe(0);
    expect(out.stdout).toBe(`${pkg.version}\n`);
  });

  it("rejects unknown commands", async () => {
    const { out, io } = capture();
    expect(await main(["nope"], io)).toBe(1);
    expect(out.stderr).toContain("Unknown command: nope");
    expect(out.stderr).toContain("bridge --help");
  });
});
