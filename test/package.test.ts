import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url).pathname;

describe("npm package", () => {
  it("contains only the runtime files", () => {
    // npm pack runs `prepare` (which rebuilds dist/) even with --ignore-scripts,
    // so pack a copy without scripts instead of the working tree.
    const copy = mkdtempSync(join(tmpdir(), "ab-pack-"));
    for (const entry of ["dist", "skill", "README.md", "LICENSE", "src", "test"]) {
      cpSync(join(root, entry), join(copy, entry), { recursive: true });
    }
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    delete pkg.scripts;
    writeFileSync(join(copy, "package.json"), JSON.stringify(pkg));
    const [pack] = JSON.parse(
      execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: copy, encoding: "utf8" }),
    ) as Array<{ files: Array<{ path: string }> }>;
    const files = pack.files.map((file) => file.path);
    for (const file of files) {
      expect(file).toMatch(
        /^(dist\/(adapters|cli|core)\/[\w-]+\.js|skill\/[\w-]+\.md|README\.md|LICENSE|package\.json)$/,
      );
    }
    for (const needed of [
      "dist/cli/bin.js",
      "skill/SKILL.md",
      "skill/bridge-code.md",
      "README.md",
      "LICENSE",
    ]) {
      expect(files).toContain(needed);
    }
  });

  it("describes the release", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.version).toBe("0.1.2");
    expect(pkg.repository.url).toContain("github.com/Dasannn/Agent-Bridge");
    expect(pkg.keywords.length).toBeGreaterThan(3);
    expect(pkg.author).toBeTruthy();
  });
});
