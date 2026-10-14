# 0004: Pseudo-Terminal and Terminal Emulation

- Status: Accepted
- Date: 2026-10-14

## Context

Plan question 6: how the session runner runs a CLI's login in a
pseudo-terminal from Node.js, preferably without native compilation.

Decision 0003 adds a requirement: the Antigravity TUI queries the terminal
(device attributes, XTVERSION, DECRQM, OSC 11) and draws nothing until it
gets replies. A bare pseudo-terminal is not enough; something must answer
those queries.

## Findings

| Option | Result |
|---|---|
| `script -qfc` with piped stdio | Starts the CLI, but nothing answers terminal queries; the Antigravity TUI stays blank |
| Python `pty` | Same problem as `script` |
| `tmux` | Works, but is a system package that may be missing in other images |
| `@lydell/node-pty` + `@xterm/headless` | Works |

`@lydell/node-pty` ships prebuilt binaries per platform (installed
`@lydell/node-pty-linux-x64` with `prebuilds/linux-x64/pty.node`); no
compiler is used. `@xterm/headless` is pure JavaScript. Installing both took
about 1 second and 2.1 MB.

The prototype (`.agent/spike/pty/probe.mjs`, not committed) does the
following:

1. Spawns the CLI with `node-pty` (`xterm-256color`, 120x40).
2. Writes the CLI's output into an `@xterm/headless` terminal.
3. Writes the terminal's `onData` replies back to the CLI, which answers its
   queries.
4. Reads the screen from the terminal buffer and joins wrapped lines.

With Antigravity logged out, the TUI drew its login menu; after Enter, the
full OAuth URL (704 characters, wrapped over several screen lines) was
recovered from the screen buffer by joining trimmed lines and matching the
URL up to the next label.

A detached Node.js process (`spawn(..., { detached: true, stdio: 'ignore' })`
plus `unref()`) kept its pseudo-terminal child alive after the launching
process exited; the runner was re-parented to PID 1.

## Decision

- The session runner uses `@lydell/node-pty` for the pseudo-terminal and
  `@xterm/headless` for terminal emulation, wired as in the prototype.
- Adapters parse prompts from the rendered screen text, not the raw byte
  stream, so line wrapping and ANSI codes are handled in one place.
- These are the only two runtime dependencies justified so far.

## Consequences

- `ARCHITECTURE.md` should name both packages and state that
  `parsePrompt` receives rendered screen text.
- Supported platforms are limited to those with `@lydell/node-pty`
  prebuilds: Linux, macOS, and Windows on x64 and arm64.
- `@lydell/node-pty` is published as a beta (`1.2.0-beta.15`), so its
  version must be pinned exactly and upgraded deliberately.
