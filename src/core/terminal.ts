import pty from "@lydell/node-pty";
import xterm from "@xterm/headless";

export interface Terminal {
  pid: number;
  /** Rendered screen and scrollback, wrapped lines joined, trailing spaces trimmed. */
  screen(): string;
  write(data: string): void;
  waitFor(predicate: (screen: string) => boolean, timeoutMs: number): Promise<boolean>;
  /** Resolves with the exit code once the process has exited and its output is rendered. */
  exited: Promise<number>;
  kill(): void;
}

export interface TerminalOptions {
  env: NodeJS.ProcessEnv;
  cwd: string;
  cols?: number;
  rows?: number;
}

const POLL_MS = 50;

export function spawnTerminal(command: string, args: string[], options: TerminalOptions): Terminal {
  const cols = options.cols ?? 120;
  const rows = options.rows ?? 40;
  const emulator = new xterm.Terminal({ cols, rows, scrollback: 1000, allowProposedApi: true });
  const child = pty.spawn(command, args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd: options.cwd,
    env: options.env as Record<string, string>,
  });

  let pending = Promise.resolve();
  child.onData((data) => {
    pending = pending.then(() => new Promise<void>((resolve) => emulator.write(data, resolve)));
  });
  // The emulator answers terminal queries (device attributes and similar) on the CLI's behalf.
  emulator.onData((reply) => child.write(reply));

  const exited = new Promise<number>((resolve) => {
    child.onExit(({ exitCode }) => {
      pending.then(() => resolve(exitCode));
    });
  });

  function screen(): string {
    const buffer = emulator.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (!line) continue;
      const text = line.translateToString(true);
      if (line.isWrapped && lines.length > 0) {
        lines[lines.length - 1] += text;
      } else {
        lines.push(text);
      }
    }
    return lines
      .map((line) => line.trimEnd())
      .join("\n")
      .trimEnd();
  }

  async function waitFor(predicate: (s: string) => boolean, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let done = false;
    exited.then(() => {
      done = true;
    });
    while (Date.now() < deadline) {
      await pending;
      if (predicate(screen())) return true;
      if (done) return predicate(screen());
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    return false;
  }

  return {
    pid: child.pid,
    screen,
    write: (data) => child.write(data),
    waitFor,
    exited,
    kill: () => {
      try {
        child.kill();
      } catch {
        // Already exited.
      }
    },
  };
}
