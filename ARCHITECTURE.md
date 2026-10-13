# Architecture

This document describes how Agent-Bridge is structured. It implements
`docs/spec.md` and must stay consistent with `docs/constitution.md`.

## Overview

Agent-Bridge is a TypeScript command-line tool distributed as an npm package.
It has no server and no network service of its own. It runs entirely inside
the user's container and only talks to:

- the CLI being authenticated (its process and stdin),
- that CLI's login callback on the loopback interface,
- the package manager, when installing a CLI.

```text
User (browser at home)
   │  opens URL, copies response
   ▼
Primary agent (chat) ──runs──▶ bridge login / complete / status / setup
                                   │
                                   ├── Adapter (one per CLI)
                                   ├── Login strategy
                                   └── Session runner (background process)
                                           │ owns
                                           ▼
                                   Target CLI login process
```

## Repository Layout

```text
src/
├── cli/             Command entry points and argument parsing
│   ├── main.ts      Dispatches to commands
│   ├── setup.ts
│   ├── status.ts
│   ├── login.ts
│   └── complete.ts
├── core/
│   ├── adapter.ts   Adapter interface and registry
│   ├── session.ts   Session runner and session state
│   ├── strategies/  Login strategies (only those used by v1 adapters)
│   ├── output.ts    Text and JSON output, secret masking
│   ├── permissions.ts  Allow rules merged into agent settings
│   └── paths.ts     State and skill locations
├── adapters/
│   ├── opencode.ts
│   └── agy.ts
skill/
└── SKILL.md         Shipped skill, installed by `setup`
test/
├── fixtures/        Recorded output of real CLIs
├── fake-cli/        Scripted CLI that simulates each login strategy
└── ...              Unit and integration tests
```

## Components

### CLI layer (`src/cli`)

Parses arguments with `node:util` `parseArgs`, calls the core, and renders the
result through `output.ts`. It contains no CLI-specific knowledge.

### Adapters (`src/adapters`)

Each adapter is the only place that knows about one target CLI. Adapters are
registered in a static registry in `core/adapter.ts`.

```ts
interface Adapter {
  id: string;                         // "opencode", "agy"
  displayName: string;
  binaries: string[];                 // commands to allow, e.g. ["opencode"]
  isInstalled(): Promise<boolean>;
  install(): Promise<void>;
  requiresLogin: boolean;             // false when usable without login
  providers: LoginProvider[];         // one entry for single-provider CLIs
  delegation: {
    example: string;                  // non-interactive invocation, for the skill
  };
}

interface LoginProvider {
  id: string;                         // "default", "openai", "github-copilot"
  isAuthenticated(): Promise<boolean>;
  command: string[];                  // login command for this provider
  input?: string[];                   // keystrokes to pick the provider, if needed
  strategy: StrategyId;
  parsePrompt(output: string): LoginPrompt | undefined;
  delegation: {
    example: string;                  // non-interactive invocation, for the skill
  };
}
```

`LoginPrompt` contains the URL to open, an optional device code, and, for the
loopback strategy, the expected callback port.

### Login strategies (`src/core/strategies`)

A strategy defines how a pasted response is validated and delivered:

| Strategy | `complete` input | Delivery |
|---|---|---|
| `paste-code` | Code shown by the provider | Written to the CLI's stdin |
| `loopback-callback` | Full URL from the browser's address bar | Validated, then requested with HTTP GET on `127.0.0.1:<port>` inside the container |
| `device-code` | None | Waits for the CLI to finish |

v1 implements only the strategies used by its adapters, as determined by the
spike.

### Session runner (`src/core/session.ts`)

`login` and `complete` are separate commands, but the CLI's login process must
stay alive between them. `bridge login` therefore starts a detached session
runner, a small Node.js process that:

1. Spawns the target CLI's login command in a pseudo-terminal, because most
   CLIs require a TTY.
2. Buffers its output until the adapter's `parsePrompt` finds a prompt, or a
   timeout expires.
3. Writes non-secret session state to `<state>/sessions/<agent>.json` (runner
   pid, strategy, prompt URL, callback port, start time, status).
4. Listens on a Unix domain socket `<state>/sessions/<agent>.sock` for the
   `complete` request.
5. On a `complete` request, applies the strategy, waits for the CLI to exit,
   reports the result over the socket, and removes its state files.
6. Exits on completion, on cancellation, or after an idle timeout.

`bridge login` waits until the runner reports a prompt (or failure), prints the
user message, and exits. `bridge complete` connects to the socket, sends the
response, and waits for the result.

Starting a new login for an agent stops any existing runner for it first.

The choice of pseudo-terminal implementation is settled by the spike, with a
preference for one that does not require native compilation.

### Permissions (`src/core/permissions.ts`)

`setup` builds allow rules for `agent-bridge`, `bridge`, and each listed
adapter's `binaries`, and merges them into the agent's user-level settings
file (for Claude Code, `~/.claude/settings.json`). The merge reads the
existing JSON, adds only missing rules, preserves every other key, and writes
the file atomically. If the file cannot be parsed, it is left untouched and
`setup` reports the error. The rule syntax and the Codex equivalent are
settled by the spike.

### Output (`src/core/output.ts`)

Every command returns a structured result that is rendered either as agent-
readable text or, with `--json`, as JSON. All rendering passes through a
masking function that removes codes, tokens, and query parameters such as
`code` and `state` from URLs that echo user input.

### Paths (`src/core/paths.ts`)

- State directory: `~/.agent-bridge/`, overridable with `AGENT_BRIDGE_HOME`
  (used by tests). Directories are created with mode `0700`.
- Skill installation targets: `~/.claude/skills/agent-bridge/` for Claude
  Code, and the Codex location determined by the spike.

Agent-Bridge never writes inside the current project directory.

## Data Flow: Login

```text
bridge login opencode
  ├─ adapter.isInstalled() → install() if needed
  ├─ adapter.isAuthenticated() → if true, report and exit
  ├─ stop existing runner, if any
  ├─ spawn detached session runner
  │     └─ spawn CLI login in a PTY → parse prompt → write state → open socket
  └─ print user message → exit 0

(user opens the URL and pastes the response into the chat)

bridge complete opencode "<response>"
  ├─ read state; fail clearly if no live runner
  ├─ connect to socket → send response
  │     runner: validate per strategy
  │       ├─ invalid → reply "rejected", keep waiting
  │       └─ valid → deliver → wait for CLI exit → adapter.isAuthenticated()
  └─ print result → exit 0 on success, non-zero otherwise
```

## Skill

`skill/SKILL.md` is static Markdown shipped in the package. Per-CLI delegation
examples come from each adapter's `delegation.example`; the skill is
regenerated from the adapters at build time so the two cannot drift.

## Technology

| Concern | Choice |
|---|---|
| Language | TypeScript, strict mode, ES modules |
| Runtime | Node.js 20 or later |
| Argument parsing | `node:util` `parseArgs` |
| Tests | Vitest |
| Lint and format | Biome |
| Build | `tsc` to `dist/` |
| CI | GitHub Actions: lint, typecheck, test |

Runtime dependencies are kept to a minimum; each one must be justified.

## Testing

- **Unit tests** for strategies, prompt parsing, input validation, and
  masking.
- **Adapter tests** against recorded output fixtures of the real CLIs.
- **Integration tests** that run the real session runner against the fake CLI
  for each strategy, covering the error cases in the spec.
- **Manual end-to-end check** in a real cloud session with real accounts,
  performed before each release.
