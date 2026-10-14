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
  const home: BridgeHome = { root, portable: !homeWritable };
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (home.portable) {
    for (const dir of Object.values(portableDirs(root))) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }
  return home;
}

function portableDirs(root: string) {
  const home = join(root, "home");
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_CACHE_HOME: join(home, ".cache"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
  };
}

export function managedEnv(env: NodeJS.ProcessEnv, home: BridgeHome): NodeJS.ProcessEnv {
  const bin = join(home.root, "prefix", "bin");
  const result: NodeJS.ProcessEnv = { ...env, PATH: env.PATH ? `${bin}:${env.PATH}` : bin };
  return home.portable ? { ...result, ...portableDirs(home.root) } : result;
}

export function sessionPaths(
  home: BridgeHome,
  agent: string,
  provider: string,
): { state: string; socket: string } {
  const base = join(home.root, "sessions", `${agent}-${provider}`);
  return { state: `${base}.json`, socket: `${base}.sock` };
}
