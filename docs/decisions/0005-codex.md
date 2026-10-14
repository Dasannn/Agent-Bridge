# 0005: Codex CLI (ChatGPT)

- Status: Accepted (real login not yet completed)
- Date: 2026-10-14

## Context

The project owner added Codex CLI to v1 as the way to use a ChatGPT
subscription. This record answers plan questions 1–5 for Codex.

## Findings

Tested with `codex-cli` 0.162.1 in a Claude Code cloud container. The login
was started and its prompt recorded, but not completed.

**Install.** `npm i -g @openai/codex` provides the `codex` binary. State lives
in `~/.codex/`.

**Login flows.**

| Command | Flow | Details |
|---|---|---|
| `codex login --device-auth` | Device code | Prints `https://auth.openai.com/codex/device` and a one-time code that expires in 15 minutes, then polls. Works without a TTY. |
| `codex login` | Loopback callback | Listener on `http://127.0.0.1:1455/auth/callback`; the CLI itself recommends `--device-auth` on headless machines. |
| `codex login --with-api-key` | API key from stdin | Out of scope (API keys never go through the chat). |

**Authentication check.** `codex login status` prints `Not logged in` and
exits `1` when logged out. It exits `0` when logged in (to confirm with a
real login).

**Delegation.** `codex exec "<task>"` runs non-interactively. Useful flags:
`--json` (event stream), `-o <file>` (last message to a file), `-C <dir>`,
`-m <model>`, `-s <sandbox mode>`, `--approve-for-me`,
`--dangerously-bypass-approvals-and-sandbox`, `--skip-git-repo-check`, and
`--ephemeral`.

**Project rules.** Codex reads `AGENTS.md` natively; it is the format's
origin. To confirm with a real run.

## Decision

- Adapter `codex`, single provider `default`, strategy `device-code`, login
  command `codex login --device-auth`. No pseudo-terminal interaction is
  needed beyond reading the prompt.
- `isAuthenticated`: `codex login status` exit code.
- `binaries`: `["codex"]`.
- Delegation example: `codex exec "<task>" --json --approve-for-me`. The
  exact approval flag is confirmed with a real run.

## Consequences

- Codex and OpenCode's ChatGPT provider use the same OpenAI device flow, so
  the `device-code` strategy serves both.
- A real login and delegation run are needed before release, by the project
  owner if they hold a ChatGPT subscription, or by a volunteer.
