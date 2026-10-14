import { describe, expect, it } from "vitest";
import { detectHost } from "../../src/core/host.js";

describe("detectHost", () => {
  it("detects Claude Code by CLAUDECODE", () => {
    expect(detectHost({ CLAUDECODE: "1" })).toBe("claude");
  });

  it("detects Claude Code by CLAUDE_CODE_ENTRYPOINT", () => {
    expect(detectHost({ CLAUDE_CODE_ENTRYPOINT: "remote" })).toBe("claude");
  });

  it("detects Codex by CODEX_THREAD_ID", () => {
    expect(detectHost({ CODEX_THREAD_ID: "t" })).toBe("codex");
  });

  it("detects Codex by CODEX_SESSION_ID", () => {
    expect(detectHost({ CODEX_SESSION_ID: "s" })).toBe("codex");
  });

  it("returns undefined for a plain environment", () => {
    expect(detectHost({ HOME: "/h", PATH: "/usr/bin" })).toBeUndefined();
  });

  it("ignores CODEX_HOME alone", () => {
    expect(detectHost({ CODEX_HOME: "/x" })).toBeUndefined();
  });

  it("ignores empty values", () => {
    expect(detectHost({ CLAUDECODE: "", CODEX_THREAD_ID: "" })).toBeUndefined();
  });
});
