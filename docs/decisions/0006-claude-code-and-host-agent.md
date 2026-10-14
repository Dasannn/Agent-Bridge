# 0006: Claude Code CLI and the Host Agent

- Status: Accepted (Codex Cloud host detection to be confirmed)
- Date: 2026-10-14

## Context

The project owner added Claude Code CLI to v1, so a Codex Cloud session can
delegate to Claude Code with a Claude subscription. The owner also asked
that Agent-Bridge never authenticate or delegate to the agent it is running
in: inside Codex, Codex is not offered; inside Claude Code, Claude Code is
not offered.

## Findings

Tested with Claude Code 2.1.296 in a Claude Code cloud container, using an
isolated `HOME` and `CLAUDE_CONFIG_DIR` so the host session was not touched.
The login was started and its prompt recorded, but not completed.

**Install.** Preinstalled in Claude Code cloud containers. Elsewhere,
`npm i -g @anthropic-ai/claude-code` provides the `claude` binary.

**Login flow: paste code.** `claude auth login` (Claude subscription by
default) prints `If the browser didn't open, visit: <url>` with redirect URI
`https://platform.claude.com/oauth/code/callback`, a hosted page that shows a
code, then `Paste code here if prompted >`. `claude setup-token` exists but
prints a long-lived token, which Agent-Bridge must not handle.

**Authentication check.** `claude auth status --json` returns `loggedIn`.
Inside a Claude Code cloud container it reported `loggedIn: true` even with
an empty config directory, because the host session's credentials reach
child processes. This confirms that the host agent must be excluded rather
than checked.

**Host detection.** Claude Code sets `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`,
and, in cloud sessions, `CLAUDE_CODE_REMOTE` in the environment of the
commands it runs. The equivalent for Codex is not yet verified.

**Delegation.** `claude -p "<task>"` runs non-interactively, with
`--output-format json` and permission flags. Claude Code reads `CLAUDE.md`;
projects that use `AGENTS.md` usually reference it from `CLAUDE.md`, as this
repository does.

## Decision

- Adapter `claude`, single provider `default`, strategy `paste-code`, login
  command `claude auth login`. `isAuthenticated`: `claude auth status --json`
  field `loggedIn`.
- `binaries`: `["claude"]`.
- Delegation example: `claude -p "<task>" --output-format json`, with the
  permission flag confirmed in Phase 3.
- Agent-Bridge detects its host agent from the environment and excludes it:
  `setup` does not install, grant permissions for, or list it; `status`
  reports it as `host`; `login` refuses it with an explanation; and the skill
  never offers to delegate to it.
- Host detection: Claude Code by `CLAUDECODE` or `CLAUDE_CODE_ENTRYPOINT`;
  Codex by a variable to be confirmed in a Codex Cloud session.

## Consequences

- v1 adapters: OpenCode, Antigravity, Codex, and Claude Code.
- Strategies: `paste-code` (Antigravity, Claude Code) and `device-code`
  (OpenCode's ChatGPT provider, Codex).
- Task 0.5 adds a Codex Cloud check for host detection and skill loading.
