import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { grantPermissions, permissionRules } from "../../src/core/permissions.js";

const fresh = () => join(mkdtempSync(join(tmpdir(), "ab-perm-")), ".claude", "settings.json");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("permissions", () => {
  it("builds rules for Agent-Bridge and each binary, without duplicates", () => {
    expect(permissionRules(["agy", "codex", "agy"])).toEqual([
      "Bash(agent-bridge *)",
      "Bash(bridge *)",
      "Bash(agy *)",
      "Bash(codex *)",
    ]);
  });

  it("creates the settings file when it does not exist", () => {
    const path = fresh();
    const result = grantPermissions(path, ["Bash(bridge *)"]);
    expect(result).toEqual({ ok: true, added: ["Bash(bridge *)"] });
    expect(read(path)).toEqual({ permissions: { allow: ["Bash(bridge *)"] } });
  });

  it("adds only missing rules and keeps everything else", () => {
    const path = fresh();
    grantPermissions(path, []);
    writeFileSync(
      path,
      JSON.stringify({
        model: "opus",
        permissions: { allow: ["Bash(ls *)", "Bash(bridge *)"], deny: ["Bash(rm *)"] },
      }),
    );
    const result = grantPermissions(path, ["Bash(bridge *)", "Bash(agy *)"]);
    expect(result).toEqual({ ok: true, added: ["Bash(agy *)"] });
    expect(read(path)).toEqual({
      model: "opus",
      permissions: { allow: ["Bash(ls *)", "Bash(bridge *)", "Bash(agy *)"], deny: ["Bash(rm *)"] },
    });
  });

  it("is idempotent", () => {
    const path = fresh();
    grantPermissions(path, ["Bash(bridge *)"]);
    const first = readFileSync(path, "utf8");
    expect(grantPermissions(path, ["Bash(bridge *)"])).toEqual({ ok: true, added: [] });
    expect(readFileSync(path, "utf8")).toBe(first);
  });

  it("leaves an unparsable or unexpected file untouched and reports it", () => {
    for (const content of ["{ not json", "[]", '{"permissions": {"allow": "Bash(x)"}}']) {
      const path = fresh();
      grantPermissions(path, []);
      writeFileSync(path, content);
      const result = grantPermissions(path, ["Bash(bridge *)"]);
      expect(result.ok).toBe(false);
      expect(readFileSync(path, "utf8")).toBe(content);
    }
  });

  it("keeps a symlinked settings file as a link", () => {
    const path = fresh();
    grantPermissions(path, []);
    const real = join(path, "..", "real-settings.json");
    writeFileSync(real, "{}");
    rmSync(path);
    symlinkSync(real, path);
    expect(grantPermissions(path, ["Bash(bridge *)"]).ok).toBe(true);
    expect(lstatSync(path).isSymbolicLink()).toBe(true);
    expect(read(real)).toEqual({ permissions: { allow: ["Bash(bridge *)"] } });
  });

  it("leaves no temporary file behind", () => {
    const path = fresh();
    grantPermissions(path, ["Bash(bridge *)"]);
    expect(readdirSync(join(path, "..")).sort()).toEqual(["settings.json"]);
    expect(existsSync(path)).toBe(true);
  });
});
