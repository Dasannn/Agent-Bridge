# Agent-Bridge Tasks

Executable tasks for the current phase of `docs/plan.md`. Tasks for later
phases are added when the previous phase ends, and reviewed before execution.

Requirements for every task:

- Follow `docs/constitution.md`, `docs/spec.md`, and `ARCHITECTURE.md`.
- Write all repository content in English.
- Keep scratch work in `.agent/`, which is never committed.
- Never commit or paste secrets. Mask codes, tokens, and `code`/`state` URL
  parameters in any saved output.

## Phase 0 — Spike: complete

All Phase 0 questions are answered in `docs/decisions/0001` to `0008`, and
the spec, architecture, and plan were updated at the Phase 0 review.
Remaining verifications are listed at the end of `docs/spec.md`.

## Phase 1 — Project scaffold: complete

Package, tooling, `bridge --help`/`--version`, and CI (green on Node 20 and
22). Deferred minor findings from the Phase 1 review are carried into the
first Phase 2 task that touches the same file.

## Phase 2 — Core

Goal: the CLI-independent core, driven end to end against a fake CLI, with
the `status`, `login`, `complete`, `logout`, and `run` commands working for
any adapter. Real adapters come in Phase 3.

Global constraints for this phase:

- Runtime dependencies: exactly `@lydell/node-pty` `1.2.0-beta.15` and
  `@xterm/headless` `6.0.0` (decision 0004), pinned. No others.
- All CLI processes Agent-Bridge starts receive the environment from
  `managedEnv` (Task 2.2). Nothing reads `process.env` directly except
  `src/cli/bin.ts`, which passes it down.
- No secret (pasted response, token) is ever written to state files or logs;
  every rendered message passes through `mask` (Task 2.1).
- Tests never touch the real home directory: they set `AGENT_BRIDGE_HOME`
  and `HOME` to temporary directories.
- Each task ends with `npm test`, `npm run typecheck`, and `npm run lint`
  passing, then a commit.

Review focus (inputs no single test exercises; reviewers check these):

1. A pasted response containing the code inside a full URL
   (`...?code=XYZ&state=...`) for a paste-code login: it is accepted only if
   the adapter says so, and never echoed unmasked.
2. Two `bridge login` calls for the same agent in quick succession: the first
   runner is stopped before the second starts; no orphan processes remain.
3. The runner process outliving its CLI (CLI crashed): `complete` reports
   the CLI's last screen, not a hang.
4. A stale state file whose runner PID no longer exists: `status` and
   `complete` treat it as no login in progress and remove it.
5. A home directory that exists but is read-only: portable mode is chosen.

### Task 2.1: Output and masking

**Files:** Create `src/core/output.ts`; Test `test/core/output.test.ts`.

**Interfaces — Produces:**

- `interface CommandResult { ok: boolean; message: string; data?: Record<string, unknown> }`
- `render(result: CommandResult, json: boolean): string` — text mode
  returns `message` plus a newline; JSON mode returns
  `JSON.stringify({ ok, message, ...data })` plus a newline. Output always
  passes through `mask`.
- `mask(text: string, secrets?: string[]): string` — replaces each
  non-empty secret with `***`, and the values of URL query parameters
  `code`, `token`, `access_token`, `refresh_token`, `id_token`, and `state`
  with `***`.

- [ ] Tests: `masks listed secrets`; `masks code and state query
      parameters` (`https://x/cb?code=abc&state=def&scope=s` →
      `https://x/cb?code=***&state=***&scope=s`); `leaves text without
      secrets unchanged`; `renders text`; `renders json with data fields`;
      `render masks secrets in message`.
- [ ] Run, watch them fail, implement, run them green, commit.

### Task 2.2: Agent-Bridge home and managed environment

**Files:** Create `src/core/paths.ts`; Test `test/core/paths.test.ts`.

**Interfaces — Produces:**

- `interface BridgeHome { root: string; portable: boolean }`
- `resolveHome(env: NodeJS.ProcessEnv): BridgeHome` — `AGENT_BRIDGE_HOME`
  wins (portable is true only if `HOME` is not writable); else
  `$HOME/.agent-bridge` if `HOME` is writable; else `/tmp/agent-bridge`
  with `portable: true`. Creates `root` with mode `0700`.
- `managedEnv(env: NodeJS.ProcessEnv, home: BridgeHome): NodeJS.ProcessEnv`
  — when `portable`, sets `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
  `XDG_CACHE_HOME`, and `CLAUDE_CONFIG_DIR` under `root` and prepends
  `<root>/prefix/bin` to `PATH`; otherwise returns a copy of `env` with
  only `<root>/prefix/bin` prepended to `PATH`.
- `sessionPaths(home: BridgeHome, agent: string, provider: string): { state: string; socket: string }`
  under `<root>/sessions/`.

- [ ] Tests: `uses AGENT_BRIDGE_HOME when set`; `uses ~/.agent-bridge when
      home is writable`; `falls back to /tmp/agent-bridge when home is
      read-only` (use a temp dir with mode `0500`; skip when running as root,
      since root ignores the mode); `managedEnv redirects home variables only
      in portable mode`; `managedEnv prepends prefix/bin to PATH`;
      `creates root with mode 0700`.
- [ ] Run, fail, implement, green, commit.

### Task 2.3: Host agent detection

**Files:** Create `src/core/host.ts`; Test `test/core/host.test.ts`.

**Interfaces — Produces:** `detectHost(env: NodeJS.ProcessEnv): "claude" | "codex" | undefined`
— `claude` if `CLAUDECODE` or `CLAUDE_CODE_ENTRYPOINT` is set; `codex` if
`CODEX_THREAD_ID` or `CODEX_SESSION_ID` is set; otherwise `undefined`
(decision 0006).

- [ ] Tests: one per variable, plus `returns undefined for a plain
      environment` and `ignores CODEX_HOME alone`.
- [ ] Run, fail, implement, green, commit.

### Task 2.4: Adapter types, registry, and response validation

**Files:** Create `src/core/adapter.ts`, `src/core/strategies.ts`; Test
`test/core/adapter.test.ts`, `test/core/strategies.test.ts`.

**Interfaces — Produces:**

- `type StrategyId = "paste-code" | "device-code"`
- `interface LoginPrompt { url: string; code?: string }`
- `interface LoginProvider { id: string; command: string[]; keys?: string[]; strategy: StrategyId; parsePrompt(screen: string): LoginPrompt | undefined; isAuthenticated(env: NodeJS.ProcessEnv): Promise<boolean>; logout(env: NodeJS.ProcessEnv): Promise<void> }`
  — `keys` are written to the terminal in order after the prompt screen
  appears (for menus, such as Antigravity's `1. Google OAuth`).
- `interface Adapter { id: string; displayName: string; binaries: string[]; requiresLogin: boolean; providers: LoginProvider[]; isInstalled(env: NodeJS.ProcessEnv): Promise<boolean>; delegationExample: string }`
- `createRegistry(adapters: Adapter[]): { get(id: string): Adapter | undefined; list(): Adapter[]; provider(adapter: Adapter, id?: string): LoginProvider | undefined }`
  — `provider` returns the only provider when `id` is omitted and there is
  exactly one, otherwise the one matching `id`.
- `validateResponse(strategy: StrategyId, input: string | undefined): { ok: true; value?: string } | { ok: false; error: string }`
  — `paste-code`: trimmed, non-empty, at most 2048 characters, no
  whitespace inside; `device-code`: always `ok`, `value` undefined.

- [ ] Tests for registry lookup and provider selection (single, by id,
      ambiguous → undefined), and for each validation rule.
- [ ] Run, fail, implement, green, commit.

### Task 2.5: Fake CLI and terminal wrapper

**Files:** Create `test/fake-cli/fake-cli.mjs`, `src/core/terminal.ts`;
Test `test/core/terminal.test.ts`. Modify `package.json` (runtime
dependencies).

**Fake CLI** (`node test/fake-cli/fake-cli.mjs <mode>`), using
`$HOME/.fake-cli/auth` as its credential file:

- `paste-code`: sends a primary-device-attributes query (`ESC [ c`) and
  waits for a reply before printing anything (like Antigravity); prints
  `Open https://example.test/auth?state=s1` and `Paste code:`; reads one
  line; on `GOOD-CODE` writes the auth file and exits `0`, otherwise prints
  `Invalid code` and exits `1`.
- `device-code`: prints `Go to https://example.test/device` and
  `Enter code: ABCD-1234`, waits `FAKE_DEVICE_MS` (default 500 ms), writes
  the auth file, exits `0`; with `FAKE_FAIL=1` prints `Denied` and exits `1`.
- `silent`: prints nothing and waits until killed.
- `status`: exits `0` if the auth file exists, `1` otherwise.
- `logout`: deletes the auth file, exits `0`.

**Interfaces — Produces:**

- `spawnTerminal(command: string, args: string[], options: { env: NodeJS.ProcessEnv; cwd: string; cols?: number; rows?: number }): Terminal`
- `interface Terminal { pid: number; screen(): string; write(data: string): void; waitFor(predicate: (screen: string) => boolean, timeoutMs: number): Promise<boolean>; exited: Promise<number>; kill(): void }`
  — `screen()` returns the rendered buffer with wrapped lines joined and
  trailing spaces trimmed; the emulator's replies are written back to the
  process (decision 0004).

- [ ] Tests: `answers terminal queries so the fake CLI draws`
      (`paste-code` mode shows `Paste code:`); `screen joins wrapped lines`
      (a 300-character URL at 80 columns is found intact); `reports the exit
      code`; `kill stops the process`.
- [ ] Add the two runtime dependencies, run, fail, implement, green, commit.

### Task 2.6: Session runner

**Files:** Create `src/core/session.ts`, `src/core/runner.ts`; Test
`test/core/session.test.ts` (integration, uses the fake CLI through a test
adapter in `test/helpers/fake-adapter.ts`).

**Interfaces — Consumes:** Tasks 2.1–2.5. **Produces:**

- `startLogin(args: { adapter: Adapter; provider: LoginProvider; home: BridgeHome; env: NodeJS.ProcessEnv; promptTimeoutMs?: number }): Promise<{ ok: true; prompt: LoginPrompt } | { ok: false; error: string; screen?: string }>`
  — stops any runner for the same agent and provider, spawns
  `runner.ts` detached (`process.execPath` with the compiled runner path),
  and resolves when the runner reports a prompt or a failure. Default
  prompt timeout 30 s.
- `completeLogin(args: { agent: string; provider: string; home: BridgeHome; response?: string; timeoutMs?: number }): Promise<{ status: "done"; ok: boolean; message: string } | { status: "rejected"; error: string } | { status: "no-session" }>`
  — default timeout 120 s for paste-code and 900 s for device-code (the
  OpenAI device code expires in 15 minutes).
- `cancelLogin(agent: string, provider: string, home: BridgeHome): Promise<void>`
- `loginInProgress(agent: string, provider: string, home: BridgeHome): Promise<boolean>`
  — false, and the stale files removed, when the runner PID is gone.
- Runner protocol: newline-delimited JSON over the Unix socket from
  `sessionPaths`. Request `{ "type": "complete", "response"?: string }`.
  Replies as in `completeLogin`. The state file holds `pid`, `agent`,
  `provider`, `strategy`, `prompt`, and `startedAt` — never the response.
  The runner exits after completion, cancellation, or 20 minutes idle.

- [ ] Tests, each against the fake CLI: `paste-code login succeeds with the
      right code`; `rejects an empty response and keeps the login alive`;
      `reports the CLI error for a wrong code`; `device-code login completes
      without a response`; `device-code failure is reported`; `silent CLI
      times out with its raw screen`; `completeLogin without a session
      returns no-session`; `a second startLogin stops the first runner`;
      `stale state file is cleaned up`; `state file never contains the
      response`.
- [ ] Run, fail, implement, green, commit.

### Task 2.7: Commands

**Files:** Modify `src/cli/main.ts`; Create `src/cli/commands.ts`; Test
`test/cli/commands.test.ts`.

**Interfaces — Consumes:** Tasks 2.1–2.6. **Produces:** `main(argv, io, deps)`
gains `deps: { env: NodeJS.ProcessEnv; registry: ReturnType<typeof createRegistry> }`
(defaults: `process.env` and the real registry, which is empty until
Phase 3). Arguments are parsed with `node:util` `parseArgs`; every command
accepts `--json`.

- `status [agent]`: per adapter: `host`, `not installed`, `ready (no login
  needed)`, `authenticated`, `not authenticated`, or `login in progress`.
- `login <agent> [--provider id]`: refuses the host; reports `already
  authenticated`; else `startLogin` and prints the user message: for
  paste-code, "Open this URL, sign in, and paste the code you are shown";
  for device-code, "Open this URL and enter the code <code>".
- `complete <agent> [--provider id] [response]`: maps `completeLogin`
  results to messages and exit codes (`rejected` and `no-session` exit `1`).
- `logout <agent> [--provider id]`: refuses the host; calls the provider's
  `logout`, then verifies `isAuthenticated` is false.
- `run <agent> [--provider id] -- <args...>`: refuses the host; spawns the
  adapter's first binary with `args` and `managedEnv`, inheriting stdio, and
  exits with its code.
- Unimplemented commands (`setup`, `skill`) print `Not implemented yet`
  and exit `1` (closes the Phase 1 deferred minor).

- [ ] Tests with the fake adapter for each command's success path, the host
      refusal, unknown agent, `--json` shape, and the `--` separator in
      `run`; plus `-h`/`-v` short flags (Phase 1 deferred minor).
- [ ] Run, fail, implement, green, commit.

### Task 2.8: Phase 2 review

- [ ] Confirm the Phase 2 exit criteria in `docs/plan.md`, including every
      error case in `docs/spec.md`.
- [ ] Whole-branch review by a fresh reviewer, with the review focus above.
- [ ] Write the Phase 3 tasks and present them to the project owner for
      approval.
