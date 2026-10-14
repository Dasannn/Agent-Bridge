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
- `AGENT_BRIDGE_PROMPT_TIMEOUT_MS` overrides the prompt timeout (90 seconds by default).

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

- [x] Tests: `findBinary finds an executable on PATH and ignores
      non-executables`; `runCommand returns code and output`; `runCommand
      times out with 124`; `stripAnsi removes colour codes`; `joinedScreen
      rebuilds a URL split across lines`. (`npmInstall` is exercised in
      Task 3.6.)
- [x] Run, fail, implement, green, commit.

### Task 3.2: Antigravity adapter

**Files:** Create `src/adapters/agy.ts`, `test/fixtures/agy-login.txt`;
Test `test/adapters/agy.test.ts`. Modify `src/adapters/index.ts`.

Values from decision 0003: binary `agy`; install with the official script
(`https://antigravity.google/cli/install.sh`) passing `--dir <prefix>/bin`;
login command `["agy"]` with `keys: ["\r"]` (selects `1. Google OAuth`);
strategy `paste-code`; `isAuthenticated`: `agy models` exits `0`;
delegation example `bridge run agy -- -p "<task>" --output-format json --dangerously-skip-permissions`.

- [x] Capture `agy-login.txt` from a logged-out `agy` (portable home)
      after the menu key, and replace secrets with placeholders.
- [x] Tests: `parsePrompt extracts the full OAuth URL from the fixture`
      (starts with `https://accounts.google.com/o/oauth2/auth?`, contains
      `redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback`, ends
      with the `state` placeholder); `parsePrompt returns undefined before the
      URL is drawn` (menu screen); `metadata matches decision 0003`.
- [x] Find and record Antigravity's logout mechanism (the TUI `/logout` is
      known); implement `logout` with it and verify against
      `isAuthenticated`.
- [x] Run, fail, implement, green, commit.

### Task 3.3: Codex adapter

**Files:** Create `src/adapters/codex.ts`, `test/fixtures/codex-login.txt`;
Test `test/adapters/codex.test.ts`. Modify `src/adapters/index.ts`.

Values from decision 0005: binary `codex`; install `npmInstall("@openai/codex")`;
login `["codex", "login", "--device-auth"]`; strategy `device-code`; prompt
URL `https://auth.openai.com/codex/device` and a code like `XXXX-XXXXX`;
`isAuthenticated`: `codex login status` exits `0`; logout `codex logout`;
delegation example `bridge run codex -- exec "<task>" --json --skip-git-repo-check`.

- [x] Capture the fixture; tests for URL and code extraction and metadata.
- [x] Run, fail, implement, green, commit.

### Task 3.4: Claude Code adapter

**Files:** Create `src/adapters/claude.ts`, `test/fixtures/claude-login.txt`;
Test `test/adapters/claude.test.ts`. Modify `src/adapters/index.ts`.

Values from decision 0006: binary `claude`; install
`npmInstall("@anthropic-ai/claude-code")`; login `["claude", "auth", "login"]`;
strategy `paste-code`; URL after `visit:` (keep `code=true` intact);
`isAuthenticated`: `claude auth status --json` has `loggedIn: true`; logout
`claude auth logout`; delegation example
`bridge run claude -- -p "<task>" --output-format json`.

- [x] Capture the fixture in an isolated `CLAUDE_CONFIG_DIR` without the host
      session's credentials.
- [ ] Record which environment variables (for example `ANTHROPIC_API_KEY`,
      `CLAUDE_CODE_OAUTH_TOKEN`) make a child `claude` report a login it did
      not get through Agent-Bridge. Needs a non-Claude host; open.
- [x] Tests for URL extraction (with `code=true` preserved) and metadata.
- [x] Run, fail, implement, green, commit.

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

- [x] Capture the OpenAI headless fixture; tests for URL and code
      extraction, provider ids, and metadata.
- [x] Run, fail, implement, green, commit.

### Task 3.6: Install on login and live verification

**Files:** Modify `src/cli/commands.ts`; Test `test/cli/commands.test.ts`.

- [x] Test and implement: `login` calls `adapter.install` when the CLI is
      missing, and reports an install failure with npm's or the script's
      output.
- [x] Live, in a cloud container, for each adapter (decisions 0009 and
      0010). Claude Code, GitHub Copilot, and OpenCode's ChatGPT login move
      to Task 4.7, from Codex Cloud: `bridge login` shows the
      prompt; `bridge status` reports correctly; `bridge run` delegates a
      one-line task. Repeat the Antigravity login with the owner end to end,
      once with a normal home and once in portable mode (`HOME` pointed at a
      non-writable path), and verify each CLI honours the portable home
      variables (spec remaining question 4).
- [x] Record results in `docs/decisions/0009-adapter-verification.md`.

### Task 3.7: Phase 3 review

- [x] Confirm the Phase 3 exit criteria in `docs/plan.md`.
- [x] Whole-branch review by a fresh reviewer. Important findings fixed with
      regression tests: timed-out commands left their children running and
      hung; the Antigravity logout read stale scrollback; a code placed before
      the agent name could be echoed. Deferred minor findings: `finishLogin`
      can overrun its deadline by one slow status check; a failed Antigravity
      logout reports no screen output.
- [x] Write the Phase 4 tasks (skill and setup) and present them for
      approval.

## Phase 4 — Skill and setup

Goal: one command in an environment's setup script (Claude Code on the web),
or one command in a task (Codex Cloud), gives the primary agent the skill,
the CLIs, and the permissions it needs, so the user can connect and delegate
by asking in plain words.

Global constraints for this phase:

- The skill is English, short, and defers messages and per-flow details to
  Agent-Bridge's own output (FR-6).
- Nothing is written into the user's repository except by `bridge skill
  --repo` (constitution principle 4, FR-6a).
- Settings files are merged, never replaced; a file that cannot be parsed is
  left untouched and reported.
- Every write is tested against a temporary `HOME`.

### Task 4.1: Spike — setup-time facts

Answer before building `setup`; record in
`docs/decisions/0011-setup.md`.

- [x] Which environment variables a Claude Code on the web setup script
      sees, and whether any identifies the host before the agent starts.
      `CLAUDE_CODE_ENTRYPOINT` does, so no `--host` option is needed.
- [x] The current Claude Code permission rule syntax for a command and its
      arguments (`Bash(bridge:*)` or `Bash(bridge *)`), checked against the
      Claude Code documentation and a fresh session (spec remaining
      question 2).
- [x] Whether a user command in `~/.claude/commands/bridge-code.md` with
      `allowed-tools` and a `!` command line runs `bridge complete
      $ARGUMENTS` without a permission prompt, or whether the same must be a
      user skill.
- [x] Whether `npx -y github:dasannn/agent-bridge#<branch>` builds the
      package (a `prepare` script), so it can be tested before release.

### Task 4.2: Skill content

**Files:** Create `skill/SKILL.md`, `src/core/skill.ts`; Test
`test/core/skill.test.ts`. Modify `src/core/adapter.ts` and the adapters.

- [x] `Adapter` gains `models: { list: string; model: string; effort: string }`
      with each CLI's options from decision 0010.
- [x] `skill/SKILL.md` covers:
  - connecting a CLI: `status`, `login` (including `--device`), and
    relaying the message verbatim;
  - finishing with `bridge complete "<code or address>"`;
  - that a container restart cancels a pending login;
  - switching accounts with `logout` and `login`;
  - delegating only on explicit request, never to the host agent, through
    `bridge run`;
  - choosing the model and effort, and keeping the choice for the
    conversation;
  - the project workflow rules (FR-7);
  - never asking for API keys or pasting secrets.
- [x] A generated section lists, per adapter, the delegation example and the
      model and effort options. `npm run build` regenerates it, and a test
      fails when the committed file is stale.
- [x] Tests:
  - every adapter appears in the generated section;
  - the skill has a valid `name` and `description` front matter;
  - the skill stays under a size budget (about 150 lines).

### Task 4.3: `bridge skill --print` and `--repo`

**Files:** Modify `src/cli/main.ts`, `src/cli/commands.ts`; Test
`test/cli/skill.test.ts`.

- [x] `--print` writes the skill to stdout.
- [x] `--repo` writes `.agents/skills/agent-bridge/SKILL.md` at the root of
      the current Git repository:
  - It overwrites only a file that carries Agent-Bridge's marker, and
    refuses otherwise.
  - It fails clearly outside a repository.
  - It never runs Git.
  - It tells the user to review and commit the file.
- [x] Tests for each case, including that no other file is created.

### Task 4.4: Permissions

**Files:** Create `src/core/permissions.ts`; Test
`test/core/permissions.test.ts`.

- [x] Build allow rules, with the syntax from Task 4.1, for `agent-bridge`,
      `bridge`, and each listed adapter's `binaries`.
- [x] Merge them into `~/.claude/settings.json`:
  - adds only missing rules and preserves every other key;
  - creates the file when it does not exist;
  - writes through a temporary file and a rename;
  - leaves an unparsable file untouched and reports it.
- [x] Tests for each of those cases and for running twice (idempotent).

### Task 4.5: `/bridge-code` command

**Files:** Create `skill/bridge-code.md`; Modify `src/core/skill.ts`; Test
`test/core/skill.test.ts`.

- [x] The command runs `bridge complete` with its arguments and needs no
      model turn beyond showing the result, in the form chosen in Task 4.1
      (FR-6b).
- [x] Installed next to the skill, only for Claude Code.

### Task 4.6: `bridge setup`

**Files:** Create `src/cli/setup.ts`; Modify `src/cli/main.ts`; Test
`test/cli/setup.test.ts`.

`bridge setup --agents <list> [--no-permissions]`:

- [x] Skips the host agent, and installs each other listed CLI if missing.
- [x] Claude Code: installs the skill to `~/.claude/skills/agent-bridge/`
      and the `/bridge-code` command, and grants permissions unless
      `--no-permissions` is given.
- [x] Codex: skips skill and permissions, and says to use `bridge skill
      --print` or `--repo`.
- [x] Prints one line per step with its outcome and exits non-zero if any
      step failed.
- [x] Is safe to run again.
- [x] Tests with fake adapters and a temporary `HOME`, covering:
  - the host being skipped;
  - an install failure, where the other steps still run and the exit code
    is non-zero;
  - `--no-permissions`;
  - running twice;
  - Codex mode.

### Task 4.7: Live verification

- [x] Claude Code on the web: a new session whose setup script runs
      `npx -y github:dasannn/agent-bridge#<branch> setup --agents
      opencode,agy,codex`. Check that:
  - the skill and `/bridge-code` are loaded;
  - no permission prompt appears;
  - the user connects a CLI and delegates a task by asking in plain words,
    choosing a model and effort;
  - the delegation respects a project's SDD workflow.
- [x] Codex Cloud: in a task, run `bridge skill --print`, then connect and
      delegate. Verify the remaining live logins with the owner:
  - Claude Code;
  - GitHub Copilot through OpenCode;
  - OpenCode's ChatGPT login by link;
  - the Codex effort option, where the host allows.
- [x] Record the results in `docs/decisions/0011-setup.md`.

### Task 4.8: Phase 4 review

- [x] Confirm the Phase 4 exit criteria in `docs/plan.md` (decision 0011).
- [x] Whole-branch review by a fresh reviewer. No Critical or Important
      findings; the minor ones were fixed with tests, except the
      `/bridge-code` quoting, which is accepted in decision 0011.
- [x] Write the Phase 5 tasks (README and release) and present them for
      approval.

## Phase 5 — Release

Goal: a stranger can install Agent-Bridge from npm and use it in Claude Code
on the web and in Codex Cloud by following the README alone.

Global constraints for this phase:

- The owner publishes to npm and merges to `main`. Agents prepare and
  verify, but never publish or merge.
- No new features. Changes are limited to documentation, packaging, and the
  deferred minor findings chosen below.

### Task 5.1: Package metadata and contents

**Files:** Modify `package.json`, `tsconfig.json`.

- [ ] Version `0.1.0`, plus `repository`, `homepage`, `bugs`, `keywords`, and
      `author`.
- [ ] Source maps: either stop emitting them or stop pointing them at
      unpublished `src/`.
- [ ] `npm pack --dry-run` lists only `dist/`, `skill/`, `README.md`,
      `LICENSE`, and `package.json`. A test or CI step checks this.
- [ ] Installing the packed tarball globally, in a temporary prefix, gives a
      working `bridge --version`, `bridge skill --print`, and `bridge setup`.

### Task 5.2: Deferred minor findings

Fix with tests, or record why not:

- [ ] `main` has no top-level error handler, and parse errors ignore `--json`.
- [ ] `run` does not forward `SIGINT`/`SIGTERM` to the CLI and maps signal
      exits to `1`.
- [ ] A runner idles for 20 minutes if its CLI dies after showing the prompt,
      and `status` keeps saying "login in progress".
- [ ] No lock against two simultaneous logins of the same CLI.
- [ ] A failed Antigravity logout reports no screen output.
- [ ] `finishLogin` can overrun its deadline by one slow status check.

### Task 5.3: README

**Files:** Create `README.md`.

- [ ] What it is, in a few lines, and an example conversation.
- [ ] Claude Code on the web setup:
  - the setup script;
  - the environment's network settings and the hosts each CLI needs;
  - what `setup` installs.
- [ ] Codex Cloud setup:
  - internet access and allowed domains;
  - the one-line task prompt that installs Agent-Bridge in `/tmp` and loads
    the skill;
  - the optional `bridge skill --repo`.
- [ ] Usage:
  - connecting each CLI, including `/bridge-code`, `--device`, and OpenCode's
    free models;
  - delegating;
  - choosing the model and effort;
  - switching accounts.
- [ ] Limits:
  - logins last only as long as the container, and a restart cancels a
    pending login;
  - GitHub logins are blocked inside Claude Code on the web.
- [ ] Security notes: what is stored, where, and what never leaves the
      container.
- [ ] A reminder to review each provider's terms, and a prominent warning
      about reported Antigravity account restrictions.
- [ ] Antigravity's first-run setup is completed with data sharing turned off
      when signing out (decision 0009).

### Task 5.4: Release checklist

**Files:** Create `docs/guides/release.md`.

- [ ] Steps before publishing:
  - green CI;
  - `npm pack` check;
  - version bump;
  - changelog notes in the GitHub release.
- [ ] Owner steps: merge to `main`, `npm publish`, and a Git tag.
- [ ] Manual end-to-end check after publishing, following only the README:
  - a fresh Claude Code on the web session and a fresh Codex Cloud task;
  - one login and one delegation each;
  - a committed repository skill loading in a new Codex Cloud task (spec
    remaining question 3).

### Task 5.5: Phase 5 review

- [ ] Confirm that every acceptance criterion in `docs/spec.md` is met, with
      a pointer to its evidence.
- [ ] Whole-branch review by a fresh reviewer; fix Critical and Important
      findings.
- [ ] Hand the release checklist to the owner.
