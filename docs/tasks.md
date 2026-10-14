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

## Phase 2 — Core: complete

The CLI-independent core and the `status`, `login`, `complete`, `logout`, and
`run` commands, tested end to end against a fake CLI (89 tests). The Phase 2
review's critical and important findings were fixed with regression tests.

Interfaces that later phases rely on (beyond the Phase 2 plan):

- `LoginProvider.normalizeResponse?(input: string): string | undefined` turns
  a pasted callback URL into a code; without it only a bare code is accepted.
- `Terminal.kill(): Promise<void>` stops the CLI's process group (SIGTERM,
  then SIGKILL) and waits for it to be reaped.
- Session state includes `cliPid`.
- `AGENT_BRIDGE_PROMPT_TIMEOUT_MS` overrides the 30-second prompt timeout.

Deferred minor findings (Phase 2 review): no lock against two simultaneous
logins; a runner idles for 20 minutes if its CLI dies after the prompt; `run`
does not forward signals or map signal exits to `128+n`; node-pty reports
exit code 0 for a signal kill; `main` has no top-level error handler; the temp
fallback directory is not re-checked for owner and mode.

## Phase 3 — Adapters

Goal: real adapters for Antigravity, Codex, Claude Code, and OpenCode, each
proven against recorded CLI screens and, where the owner holds the
subscription, a real login in a cloud container.

Global constraints for this phase:

- Each adapter lives in its own file under `src/adapters/` and is the only
  place that knows its CLI (constitution principle 5).
- Adapters install their CLI into the Agent-Bridge prefix
  (`<root>/prefix`), never globally, so the same code works with a
  read-only home (decision 0008). `login` installs a missing CLI (FR-4).
- Adapters never read, edit, or delete credential files; status and logout
  use the CLI's own commands (decision 0006 and spec FR-4b).
- Fixtures are real screens captured with `spawnTerminal`, with every
  `state`, `code_challenge`, and code value replaced by placeholders.

### Task 3.1: Shared adapter helpers

**Files:** Create `src/adapters/util.ts`; Test `test/adapters/util.test.ts`.

**Interfaces — Produces:**

- `findBinary(name: string, env: NodeJS.ProcessEnv): string | undefined` —
  searches `env.PATH`.
- `runCommand(command: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs?: number): Promise<{ code: number; stdout: string; stderr: string }>`
  — no TTY; default timeout 30 s, reported as code `124`.
- `npmInstall(pkg: string, env: NodeJS.ProcessEnv): Promise<void>` —
  `npm install -g --prefix <prefix>` where `<prefix>` is the first `PATH`
  entry's parent (the managed `prefix/bin`); throws with npm's stderr tail on
  failure.
- `stripAnsi(text: string): string`.
- `joinedScreen(screen: string): string` — trims every line and joins them
  without separators, for URLs that TUIs break across lines.
- `Adapter` gains `install(env: NodeJS.ProcessEnv): Promise<void>`.

- [ ] Tests: `findBinary finds an executable on PATH and ignores
      non-executables`; `runCommand returns code and output`; `runCommand
      times out with 124`; `stripAnsi removes colour codes`; `joinedScreen
      rebuilds a URL split across lines`. (`npmInstall` is exercised in
      Task 3.6.)
- [ ] Run, fail, implement, green, commit.

### Task 3.2: Antigravity adapter

**Files:** Create `src/adapters/agy.ts`, `test/fixtures/agy-login.txt`;
Test `test/adapters/agy.test.ts`. Modify `src/adapters/index.ts`.

Values from decision 0003: binary `agy`; install with the official script
(`https://antigravity.google/cli/install.sh`) passing `--dir <prefix>/bin`;
login command `["agy"]` with `keys: ["\r"]` (selects `1. Google OAuth`);
strategy `paste-code`; `isAuthenticated`: `agy models` exits `0`;
delegation example `bridge run agy -- -p "<task>" --output-format json --dangerously-skip-permissions`.

- [ ] Capture `agy-login.txt` from a logged-out `agy` (portable home)
      after the menu key, and replace secrets with placeholders.
- [ ] Tests: `parsePrompt extracts the full OAuth URL from the fixture`
      (starts with `https://accounts.google.com/o/oauth2/auth?`, contains
      `redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback`, ends
      with the `state` placeholder); `parsePrompt returns undefined before the
      URL is drawn` (menu screen); `metadata matches decision 0003`.
- [ ] Find and record Antigravity's logout mechanism (the TUI `/logout` is
      known); implement `logout` with it and verify against
      `isAuthenticated`.
- [ ] Run, fail, implement, green, commit.

### Task 3.3: Codex adapter

**Files:** Create `src/adapters/codex.ts`, `test/fixtures/codex-login.txt`;
Test `test/adapters/codex.test.ts`. Modify `src/adapters/index.ts`.

Values from decision 0005: binary `codex`; install `npmInstall("@openai/codex")`;
login `["codex", "login", "--device-auth"]`; strategy `device-code`; prompt
URL `https://auth.openai.com/codex/device` and a code like `XXXX-XXXXX`;
`isAuthenticated`: `codex login status` exits `0`; logout `codex logout`;
delegation example `bridge run codex -- exec "<task>" --json --skip-git-repo-check`.

- [ ] Capture the fixture; tests for URL and code extraction and metadata.
- [ ] Run, fail, implement, green, commit.

### Task 3.4: Claude Code adapter

**Files:** Create `src/adapters/claude.ts`, `test/fixtures/claude-login.txt`;
Test `test/adapters/claude.test.ts`. Modify `src/adapters/index.ts`.

Values from decision 0006: binary `claude`; install
`npmInstall("@anthropic-ai/claude-code")`; login `["claude", "auth", "login"]`;
strategy `paste-code`; URL after `visit:` (keep `code=true` intact);
`isAuthenticated`: `claude auth status --json` has `loggedIn: true`; logout
`claude auth logout`; delegation example
`bridge run claude -- -p "<task>" --output-format json`.

- [ ] Capture the fixture in an isolated `CLAUDE_CONFIG_DIR` without the host
      session's credentials, and record which environment variables must be
      removed so a child `claude` does not inherit the host login.
- [ ] Tests for URL extraction (with `code=true` preserved) and metadata.
- [ ] Run, fail, implement, green, commit.

### Task 3.5: OpenCode adapter

**Files:** Create `src/adapters/opencode.ts`,
`test/fixtures/opencode-openai.txt`; Test `test/adapters/opencode.test.ts`.
Modify `src/adapters/index.ts`.

Values from decision 0002: binary `opencode`; install
`npmInstall("opencode-ai")`; `requiresLogin: false`; providers `openai`
(login `["opencode", "providers", "login"]`, keys type `OpenAI`, Enter, Down,
Enter to choose "ChatGPT Pro/Plus (headless)", strategy `device-code`) and
`github-copilot` (keys type `Copilot`, Enter, Enter; strategy
`device-code`); `isAuthenticated`: `opencode providers list` output, ANSI
stripped, names the provider; logout `opencode providers logout`, with the
exact argument confirmed here; delegation example
`bridge run opencode -- run "<task>" --format json`.

- [ ] Capture the OpenAI headless fixture; tests for URL and code
      extraction, provider ids, and metadata.
- [ ] Run, fail, implement, green, commit.

### Task 3.6: Install on login and live verification

**Files:** Modify `src/cli/commands.ts`; Test `test/cli/commands.test.ts`.

- [ ] Test and implement: `login` calls `adapter.install` when the CLI is
      missing, and reports an install failure with npm's or the script's
      output.
- [ ] Live, in a cloud container, for each adapter: `bridge login` shows the
      prompt; `bridge status` reports correctly; `bridge run` delegates a
      one-line task. Repeat the Antigravity login with the owner end to end,
      once with a normal home and once in portable mode (`HOME` pointed at a
      non-writable path), and verify each CLI honours the portable home
      variables (spec remaining question 4).
- [ ] Record results in `docs/decisions/0009-adapter-verification.md`.

### Task 3.7: Phase 3 review

- [ ] Confirm the Phase 3 exit criteria in `docs/plan.md`.
- [ ] Whole-branch review by a fresh reviewer.
- [ ] Write the Phase 4 tasks (skill and setup) and present them for
      approval.
