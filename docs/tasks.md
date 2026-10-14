# Agent-Bridge Tasks

Executable tasks for the current phase of `docs/plan.md`. Tasks for later
phases are added when the previous phase ends, and reviewed before execution.

Requirements for every task:

- Follow `docs/constitution.md`, `docs/spec.md`, and `ARCHITECTURE.md`.
- Write all repository content in English.
- Keep scratch work in `.agent/`, which is never committed.
- Never commit or paste secrets. Mask codes, tokens, and `code`/`state` URL
  parameters in any saved output.

## Phase 0 — Spike: verify the target CLIs

No product code is written in this phase. Each task ends with a decision
record in `docs/decisions/`, using this format:

```markdown
# NNNN: <Title>

- Status: Accepted | Blocked
- Date: YYYY-MM-DD

## Context
<The question, from docs/plan.md Phase 0.>

## Findings
<What was tried and observed, with commands and masked output.>

## Decision
<The answer the rest of the project relies on.>

## Consequences
<What changes in the spec, architecture, or later tasks.>
```

### Task 0.1: Spike workspace and package name

Answers plan question 9.

- [ ] Add `.agent/` to `.gitignore`.
- [ ] Record the container baseline: OS, `node --version`, `npm --version`,
      and whether `npm` and GitHub are reachable through the network policy.
- [ ] Run `npm view agent-bridge` and `npm view @dasannn/agent-bridge`, and
      record which names are available.
- [ ] Write `docs/decisions/0001-package-name-and-baseline.md` with the
      chosen package name.
- [ ] Commit `.gitignore` and the decision record.

### Task 0.2: OpenCode

Answers plan questions 1–5 for OpenCode. OpenCode is multi-provider: v1
targets free models (no login) and the ChatGPT and GitHub Copilot
subscription providers. The project owner does not use those subscriptions,
so their real login is verified by a volunteer or at the release checklist;
until then, record the flow from the CLI's output.

Requires network access to `opencode.ai`, `models.opencode.ai`, `models.dev`,
and, for the providers, `auth.openai.com` and `github.com`.

- [ ] Install OpenCode with its official method; record the command and the
      binary name.
- [ ] Find its login command and run it in a pseudo-terminal (for example
      `script -qfc "<command>" /dev/null`); save the full output, masked, to
      `.agent/spike/opencode-login.txt`.
- [ ] Confirm that a free model runs with no login.
- [ ] For each of ChatGPT and GitHub Copilot, identify the flow (device code,
      paste code, or loopback callback with its port) and the keystrokes that
      select the provider in the login picker.
- [ ] Relay the URL to the project owner, collect the pasted response, and
      complete the login using that flow. Record every step that was needed.
- [ ] Find a command or file check that reports whether OpenCode is
      authenticated without printing secrets; verify it before and after
      login.
- [ ] Find the non-interactive invocation for a delegated task, run one small
      task, and record how output and exit code behave.
- [ ] Check whether OpenCode reads `AGENTS.md` from the working directory.
- [ ] Note the terms of OpenAI and GitHub on using their subscriptions
      through OpenCode.
- [ ] Write `docs/decisions/0002-opencode.md` and commit it.

### Task 0.3: Antigravity (`agy`)

Answers plan questions 1–5 for Antigravity.

- [ ] Repeat every step of Task 0.2 for Antigravity, saving output to
      `.agent/spike/agy-login.txt`.
- [ ] Write `docs/decisions/0003-antigravity.md` and commit it.

### Task 0.4: Pseudo-terminal in Node.js

Answers plan question 6. Depends on Tasks 0.2 and 0.3.

- [ ] In `.agent/spike/pty/`, try running each CLI's login command from a
      Node.js process through: (a) a prebuilt pseudo-terminal package that
      needs no compilation, and (b) the system `script` utility with piped
      stdin and stdout.
- [ ] For each option, check that the prompt URL can be read, input can be
      written, and the child stays alive after the parent detaches.
- [ ] Record install size, install time, and any native build step.
- [ ] Write `docs/decisions/0004-pseudo-terminal.md` choosing one option, and
      commit it.

### Task 0.5: Skills and permissions in cloud agents

Answers plan questions 7 and 8. Requires the project owner to edit a cloud
environment's setup script and start a new session.

- [ ] Confirm from current documentation where Claude Code loads user skills,
      and where Codex loads them; record whether one `SKILL.md` format serves
      both.
- [ ] Confirm the current Claude Code permission rule syntax for allowing a
      command prefix.
- [ ] Prepare a setup script that installs a minimal test skill into the
      user skill directory and adds one allow rule to
      `~/.claude/settings.json`. The project owner adds it to a cloud
      environment and starts a new session.
- [ ] In that session, record whether the skill is listed and whether the
      allowed command runs without a permission prompt.
- [ ] Record how Codex Cloud handles command approvals and whether an
      equivalent step is needed.
- [ ] In a Codex Cloud session, record which environment variable identifies
      Codex as the host agent, and whether the skill loads there.
- [ ] Write `docs/decisions/0007-skills-and-permissions.md` and commit it.

### Task 0.5a: Codex and Claude Code CLIs

Added by the project owner during Phase 0. Recorded in
`docs/decisions/0005-codex.md` and
`docs/decisions/0006-claude-code-and-host-agent.md`.

- [x] Codex: install, device-code login prompt, status check, `exec` flags.
- [x] Claude Code: paste-code login prompt, status check, host detection.
- [ ] Real login and delegation for each, by the project owner or a
      volunteer with the subscription.
- [ ] Logout command for each adapter: `opencode providers logout <id>`,
      `codex logout`, `claude auth logout`, and the Antigravity equivalent
      (only `/logout` inside the TUI is known), verified against
      `isAuthenticated`.

### Task 0.6: Spike review

- [ ] Check that every question in `docs/plan.md` Phase 0 has an accepted or
      blocked decision record.
- [ ] Propose any spec, architecture, or plan changes the findings require.
- [ ] Review the findings with the project owner. Phase 1 tasks are written
      only after approval.
