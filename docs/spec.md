# Agent-Bridge Specification

This document defines what Agent-Bridge v1 does. It describes behavior, not
implementation; see `ARCHITECTURE.md` for structure. It must stay consistent
with `docs/constitution.md`.

## Problem

Cloud coding agents (Claude Code on the web, Codex Cloud) run in remote,
ephemeral containers. The user talks to the agent through a chat and never has
direct access to the container's terminal or network.

Other coding-agent CLIs, such as OpenCode, Antigravity (`agy`), Codex, and
Claude Code, can be
installed in that container, but their login flows assume a human at the same
machine: they open a local browser, wait for typed input, or redirect to a
callback on `localhost`. A user at home cannot complete these flows, so the
primary agent cannot use the user's subscriptions to those tools.

## Goal

Let a user authenticate supported CLIs inside a cloud session by relaying a
URL and a pasted response through the primary agent's chat, so the user can
then ask the primary agent to delegate tasks to those CLIs.

## Users

- **User**: a person who owns subscriptions to one or more supported CLIs and
  works with a cloud coding agent.
- **Primary agent**: the cloud coding agent that runs Agent-Bridge on the
  user's behalf.

## User Stories

1. As a user, I configure my cloud environment once so that every new session
   has Agent-Bridge, the supported CLIs, and the skill available.
2. As a user, I ask the primary agent to connect a CLI, open the URL it gives
   me in my own browser, paste back what the browser shows, and the CLI is
   authenticated in the session.
3. As a user, I ask the primary agent to delegate a task to an authenticated
   CLI, and it does so following my project's workflow.
4. As a user, I can ask the primary agent which CLIs are installed and
   authenticated.

## Scope (v1)

Supported CLIs: **OpenCode**, **Antigravity (`agy`)**, **Codex CLI** (for
ChatGPT subscriptions), and **Claude Code CLI** (for Claude subscriptions).

The agent Agent-Bridge runs inside (the host agent) is never a delegation
target: inside Codex, Codex is excluded; inside Claude Code, Claude Code is
excluded.

Supported platforms: Linux containers with Node.js 20 or later. Local use on
macOS or Linux is allowed but not a primary target.

### Out of scope

- Persisting credentials across sessions (credential vault).
- CLIs other than OpenCode, Antigravity, Codex CLI, and Claude Code CLI.
- An MCP server, a Claude Code plugin, or any hosted service.
- Windows support.
- Delegation performed by Agent-Bridge itself. The primary agent runs the
  delegated CLI directly.

## Functional Requirements

### FR-1 Command

Agent-Bridge is distributed as an npm package that provides the command
`agent-bridge`, with the alias `bridge`.

### FR-2 `setup`

`bridge setup --agents <list>` prepares a session:

- Detects the host agent and skips it if it is listed.

- Installs each listed CLI if it is not already installed.
- Installs the Agent-Bridge skill where the primary agent loads skills.
- Grants the primary agent permission to run Agent-Bridge and each listed CLI
  without prompting, by adding allow rules to the agent's user-level settings
  (for Claude Code, `~/.claude/settings.json`). Existing settings are
  preserved, the granted rules are listed in the output, and
  `--no-permissions` skips this step.
- Is safe to run repeatedly and suitable for an environment setup script.
- Reports, per CLI, whether it succeeded, and exits non-zero if any step
  failed.

### FR-3 `status`

`bridge status [agent]` reports, for each supported CLI (or the one given),
whether it is installed and whether it is authenticated, and whether a login
is in progress. For a multi-provider CLI it reports each connected provider.
A CLI that can be used without logging in (for example OpenCode's free
models) is reported as ready once installed.

### FR-4 `login`

`bridge login <agent> [--provider <id>]`:

- `--provider` selects the provider for multi-provider CLIs such as OpenCode,
  and is required for them. For OpenCode, v1 supports the subscription
  providers ChatGPT (OpenAI) and GitHub Copilot, subject to the spike.
- Installs the CLI if missing.
- If the CLI is already authenticated, says so and exits successfully without
  starting a new login.
- Otherwise starts the CLI's official login flow in the background, captures
  the URL (and device code, if any) the CLI produces, and exits while the
  login process keeps running.
- Prints a message intended for the user, which the primary agent relays
  verbatim. The message states what to open and exactly what to paste back.
- If a login for the same CLI is already in progress, it is cancelled and a
  new one started.

### FR-4a Host agent

Agent-Bridge detects the host agent from its environment. `status` reports
it as the host, `login` refuses it with an explanation, and the skill never
offers it as a delegation target.

### FR-4b `logout`

`bridge logout <agent> [--provider <id>]` signs the CLI (or one provider of a
multi-provider CLI) out using the CLI's own logout mechanism, and verifies
that it is no longer authenticated. Switching accounts, for example when one
account runs out of usage, is `logout` followed by `login`. Agent-Bridge
never deletes or edits credential files itself. The host agent cannot be
logged out.

### FR-5 `complete`

`bridge complete <agent> [response]`:

- Delivers the user's pasted response to the in-progress login, according to
  that CLI's flow (typed code or loopback callback URL). For flows that need
  no response, it waits for the login to finish.
- Validates the response before using it. Invalid input is rejected without
  cancelling the login, so the user can paste again.
- Waits for the login to finish, with a timeout, and verifies the CLI is
  authenticated.
- Reports success, or a specific failure with the next step to take.

### FR-6 Skill

Agent-Bridge ships one skill, `SKILL.md`, usable by Claude Code and Codex. It
instructs the primary agent to:

- Use `logout` then `login` when the user asks to switch accounts, for
  example after running out of usage on one account.
- Use `status`, `login`, and `complete` to authenticate a CLI when the user
  asks to connect it, or when the user asks to delegate to it and it is not
  authenticated.
- Relay Agent-Bridge's messages to the user verbatim.
- Delegate only when the user explicitly asks, never on its own initiative.
- Invoke each supported CLI non-interactively, giving it a self-contained
  task, and show the user the result and the resulting changes.
- Follow the project's workflow when one exists (FR-7).
- Never paste tokens or secrets into the chat.

The skill stays short. Messages, error details, and per-flow instructions come
from Agent-Bridge's output rather than from the skill.

### FR-6a `skill`

`bridge skill` installs or shows the skill:

- `bridge skill --print` prints the skill's content.
- `bridge skill --repo` writes the skill to
  `.agents/skills/agent-bridge/SKILL.md` in the current repository, for
  agents that only load repository skills (Codex Cloud). It writes that one
  file and nothing else, overwrites only a previous Agent-Bridge skill, never
  commits, and tells the user to review and commit it.
- The primary agent runs `bridge skill --repo` only when the user asks.

### FR-7 Project workflow

When the user's project defines a workflow (for example in `AGENTS.md`,
`CLAUDE.md`, or `docs/`), the skill instructs the primary agent to:

- Tie the delegated task to approved planned work, and warn the user before
  delegating work that does not match any.
- Tell the delegated CLI to read and follow the project's rules and sources of
  truth, in the priority order the project defines.
- Review the delegated result against the project's spec and task before
  presenting it as done, and respect any approval gates.

Without a defined workflow, delegation proceeds normally.

### FR-8 Output

- Default output is plain text written to be read by an agent.
- `--json` produces machine-readable output for every command.
- Exit code is `0` on success and non-zero on failure.

## Error Handling Requirements

| Situation | Required behavior |
|---|---|
| The CLI prints no URL or code within the timeout | Stop the login process and show the CLI's raw output |
| `complete` with no login in progress, or the login process has exited | Explain this and say to run `bridge login <agent>` again |
| Pasted response is empty or malformed | Reject it, keep the login running, explain what to paste |
| Callback URL does not target the expected loopback host and port | Reject it without making any request |
| Provider rejects or expires the code | Show the CLI's error and say to restart the login |
| Provider host is unreachable | Say that the environment's network policy may need to allow it |

## Security Requirements

- Pasted responses are sent only to the CLI's stdin or to its callback on the
  container's loopback interface.
- Codes and tokens are never written to logs or to Agent-Bridge state, and are
  masked in any error output.
- Agent-Bridge stores its own state outside the user's repository and never
  writes files into the repository, except the single skill file written by
  `bridge skill --repo` on explicit request (FR-6a).
- Agent-Bridge never asks for, accepts, or relays API keys through the chat.
  API keys belong in the cloud environment's secrets or environment
  variables, and the skill tells the primary agent never to request them.
- Permission rules granted by `setup` are limited to Agent-Bridge and the
  binaries of the listed CLIs.

## Acceptance Criteria

1. In a fresh cloud session whose setup script runs `bridge setup --agents
   opencode,agy,codex,claude`, every listed CLI except the host agent and the skill are available without further
   manual steps.
2. For each supported CLI, a user can authenticate in a cloud session by
   opening one URL and pasting back one response through the chat.
3. After authentication, `bridge status` reports the CLI as authenticated, and
   the primary agent can run a delegated task with it on request.
4. Every error case in the table above produces the required behavior.
5. No secrets appear in Agent-Bridge's output, logs, or state files.

## Open Questions

These are resolved by the initial spike and recorded in `docs/decisions/`:

1. Which login flow each supported CLI uses in a headless container, and
   whether it can be driven as specified.
2. How to check whether each CLI is authenticated.
3. The non-interactive invocation of each CLI for delegation.
4. Whether each CLI reads `AGENTS.md` natively.
5. Where Codex loads skills from, and whether one `SKILL.md` serves both
   Claude Code and Codex.
6. The current permission rule syntax, whether user-level settings apply in
   cloud sessions, and how Codex handles command approvals.
7. Whether the npm package name `agent-bridge` is available.
