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

Agent-Bridge is distributed as the npm package `cloud-agent-bridge`, which
provides the command `agent-bridge`, with the alias `bridge`.

### FR-2 `setup`

`bridge setup --agents <list>` prepares a session:

- Detects the host agent and skips it if it is listed.
- Installs each listed CLI if it is not already installed.
- Installs the Agent-Bridge skill where the primary agent loads user skills
  (Claude Code: `~/.claude/skills/agent-bridge/`). Where user skills cannot
  be installed (Codex Cloud), it skips this step and says how to use
  `bridge skill` instead.
- Grants the primary agent permission to run Agent-Bridge and each listed CLI
  without prompting, by adding allow rules to the agent's user-level settings
  (for Claude Code, `~/.claude/settings.json`). Existing settings are
  preserved, the granted rules are listed in the output, and
  `--no-permissions` skips this step.
- Is safe to run repeatedly and suitable for an environment setup script.
- Reports, per CLI, whether it succeeded, and exits non-zero if any step
  failed.

### FR-2a Portable home

When the home directory is not writable (as in Codex Cloud tasks),
Agent-Bridge uses a portable home: `AGENT_BRIDGE_HOME` if set, otherwise
`/tmp/agent-bridge`. CLIs are installed under it, and every CLI process that
Agent-Bridge starts runs with its home and configuration directories pointing
inside it, so logins are stored there. When the home directory is writable,
the portable home holds only Agent-Bridge's own state and CLIs use their
normal locations.

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

`bridge complete [<agent>] [response]`:

- The agent may be omitted when exactly one login is in progress, so the user
  can finish a login with just `bridge complete "<code>"`. With several logins
  in progress it lists them and asks for the agent.
- Delivers the user's pasted response to the in-progress login as typed
  input (paste-code flows). For device-code flows, which need no response,
  it waits for the login to finish.
- Validates the response before using it. Invalid input is rejected without
  cancelling the login, so the user can paste again.
- Waits for the login to finish, with a timeout, and verifies the CLI is
  authenticated.
- Reports success, or a specific failure with the next step to take.

### FR-5a `run`

`bridge run <agent> [--provider <id>] -- <args...>` runs the CLI with the
given arguments in the environment Agent-Bridge manages (portable home and
`PATH`), passes its standard input, output, and exit code through unchanged,
and refuses the host agent. The skill uses `bridge run` for every delegation,
so one skill works in every environment.

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

### FR-6b Paste command

So the user can finish a login without asking the primary agent in words,
`setup` installs a Claude Code custom command, `/bridge-code <code>`, that
runs `bridge complete` with the code. It is installed next to the skill
(`~/.claude/commands/bridge-code.md`) and only where the skill is installed.
Codex Cloud has no writable location for custom prompts, so there the user
pastes the code in the chat.

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
| Provider rejects or expires the code | Show the CLI's error and say to restart the login |
| Provider host is unreachable | Say that the environment's network policy may need to allow it |

## Security Requirements

- Pasted responses are sent only to the CLI's standard input.
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

## Decisions and Remaining Questions

The Phase 0 spike answered the original open questions; see
`docs/decisions/0001` to `0008`.

Still open, to be verified in the phase that needs them:

1. Real login and delegation for Codex, Claude Code, and OpenCode's ChatGPT
   and GitHub Copilot providers (by a volunteer with the subscription; see
   decision 0009).
2. The Claude Code permission rule syntax written by `setup` (Phase 4).
3. Whether a committed repository skill loads at the start of a Codex Cloud
   task (release checklist).

Each CLI's behavior under the portable home was verified in Phase 3
(decision 0009), except Claude Code, which is the host agent in the
container used.
