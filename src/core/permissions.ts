// Allow rules merged into the primary agent's user settings (ARCHITECTURE.md, Permissions).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type GrantResult = { ok: true; added: string[] } | { ok: false; error: string };

/** Claude Code rules allowing Agent-Bridge and the given binaries with any arguments. */
export function permissionRules(binaries: string[]): string[] {
  const names = ["agent-bridge", "bridge", ...binaries];
  return [...new Set(names)].map((name) => `Bash(${name} *)`);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Adds the missing rules to `permissions.allow` in a settings file, keeping
 * every other setting. A file that is not a settings object is left untouched.
 */
export function grantPermissions(path: string, rules: string[]): GrantResult {
  let settings: Record<string, unknown> = {};
  if (existsSync(path)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      return { ok: false, error: `${path} is not valid JSON (${(error as Error).message}).` };
    }
    if (!isObject(parsed)) return { ok: false, error: `${path} does not hold a settings object.` };
    settings = parsed;
  }
  const permissions = settings.permissions ?? {};
  if (!isObject(permissions))
    return { ok: false, error: `${path}: "permissions" is not an object.` };
  const allow = permissions.allow ?? [];
  if (!Array.isArray(allow))
    return { ok: false, error: `${path}: "permissions.allow" is not a list.` };

  const added = rules.filter((rule) => !allow.includes(rule));
  if (added.length === 0 && existsSync(path)) return { ok: true, added };
  settings.permissions = { ...permissions, allow: [...allow, ...added] };
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
  return { ok: true, added };
}
