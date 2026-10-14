import { accessSync, constants, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface BridgeHome {
  root: string;
  /** True when the real home directory is not writable (decision 0008). */
  portable: boolean;
}

export function isWritableDir(path: string | undefined): boolean {
  if (!path) return false;
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveHome(
  env: NodeJS.ProcessEnv,
  isWritable: (path: string | undefined) => boolean = isWritableDir,
): BridgeHome {
  const homeWritable = isWritable(env.HOME);
  let root: string;
  if (env.AGENT_BRIDGE_HOME) {
    root = env.AGENT_BRIDGE_HOME;
  } else if (homeWritable && env.HOME) {
    root = join(env.HOME, ".agent-bridge");
  } else {
    root = join(env.TMPDIR || tmpdir(), "agent-bridge");
  }
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return { root, portable: !homeWritable };
}

export function managedEnv(env: NodeJS.ProcessEnv, home: BridgeHome): NodeJS.ProcessEnv {
  const bin = join(home.root, "prefix", "bin");
  const result: NodeJS.ProcessEnv = { ...env, PATH: env.PATH ? `${bin}:${env.PATH}` : bin };
  if (home.portable) {
    const fakeHome = join(home.root, "home");
    result.HOME = fakeHome;
    result.XDG_CONFIG_HOME = join(fakeHome, ".config");
    result.XDG_DATA_HOME = join(fakeHome, ".local", "share");
    result.XDG_CACHE_HOME = join(fakeHome, ".cache");
    result.CLAUDE_CONFIG_DIR = join(fakeHome, ".claude");
  }
  return result;
}

export function sessionPaths(
  home: BridgeHome,
  agent: string,
  provider: string,
): { state: string; socket: string } {
  const base = join(home.root, "sessions", `${agent}-${provider}`);
  return { state: `${base}.json`, socket: `${base}.sock` };
}
