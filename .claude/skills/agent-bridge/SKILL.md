---
name: agent-bridge
description: Connect coding-agent CLIs (OpenCode, Antigravity, Codex, Claude Code) with the user's own subscriptions in this cloud session, and delegate tasks to them when the user asks. Use when the user asks to log in to, connect, switch accounts on, or delegate work to one of these CLIs, or to choose their model or effort.
---

# Agent-Bridge

Agent-Bridge (`bridge`) logs coding-agent CLIs in with the user's own
subscriptions, through this chat, and runs them for delegation. Its output is
written for you: follow it, and relay to the user exactly what it says to
relay.

## Rules

- Delegate only when the user explicitly asks, and only to the CLI they name.
  Never delegate on your own initiative.
- Never delegate to yourself. `bridge status` marks the agent you are running
  in as `host`; Agent-Bridge refuses to manage it.
- Never ask for, accept, or paste API keys, tokens, or passwords. Login codes
  and callback addresses go only to `bridge complete`. If a user offers an API
  key, tell them it belongs in the cloud environment's secrets instead.
- Always run CLIs through `bridge run <agent> -- <arguments>`, never
  directly: it uses the environment Agent-Bridge set up for them.

## Connect a CLI

1. `bridge status` shows which CLIs are installed, authenticated, or in
   the middle of a login. OpenCode works without a login, with its free
   models.
2. `bridge login <agent>` installs the CLI if needed and starts its login.
   - OpenCode's subscription logins need `--provider openai` or
     `--provider github-copilot`.
   - For ChatGPT logins, add `--device` if the user prefers to type a code
     over pasting an address.
3. Relay the message it prints to the user, exactly as printed.
4. When the user replies, run `bridge complete "<what they pasted>"`: a code,
   or the address their browser could not open. With no reply needed
   (device codes), run `bridge complete <agent>` once they say they are done.
5. If `complete` rejects the input, the login keeps waiting: relay the error
   and let the user paste again. If it says no login is in progress (for
   example after the container restarted), start again with `bridge login`.

To switch accounts, for example when one runs out of usage, run
`bridge logout <agent>`, then `bridge login <agent>`.

## Delegate a task

1. Confirm with `bridge status` that the CLI is ready. If it is not, connect
   it first (above).
2. Write a self-contained task: the goal, the files involved, constraints,
   and what "done" means. The CLI does not see this conversation.
3. Run it non-interactively with the command for that CLI (below), from the
   project directory.
4. Show the user the result and the changes it made (`git status`,
   `git diff`). Review them yourself before calling the task done.

### Model and effort

- If the user names a model or effort, use the CLI's options below. If they
  ask what is available, list the models and offer the choices; for
  OpenCode, separate its free models from their subscriptions' models.
- Keep the chosen model and effort for later delegations to that CLI in this
  conversation, unless the user changes them.
- Pass them on each delegation. Do not edit the CLIs' configuration files.

### Project workflow

If the project defines a workflow (for example in `AGENTS.md`, `CLAUDE.md`,
or `docs/`):

- Tie the delegated task to approved, planned work. Warn the user before
  delegating work that matches none.
- Tell the CLI to read and follow the project's rules and sources of truth,
  in the priority order the project defines.
- Review the result against the project's spec and task before presenting it
  as done, and respect the project's approval gates.

Without a defined workflow, delegate normally.

## Commands by CLI

<!-- agents:start -->
### OpenCode (`opencode`)

- Delegate: `bridge run opencode -- run "<task>" --format json`
- Models: `bridge run opencode -- models [provider] --verbose`; free models are `opencode/*`, and `--verbose` shows each model's variants
- Model: `run -m <provider>/<model>`
- Effort: `run --variant <variant>`, one of the model's variants (models without variants ignore it)

### Antigravity (`agy`)

- Delegate: `bridge run agy -- -p "<task>" --output-format json --dangerously-skip-permissions`
- Models: `bridge run agy -- models`
- Model: `--model <name>`
- Effort: `--effort low|medium|high|xhigh|max`

### Codex (`codex`)

- Delegate: `bridge run codex -- exec "<task>" --json --skip-git-repo-check`
- Models: `bridge run codex -- debug models` (JSON: each `slug` and its `supported_reasoning_levels`)
- Model: `exec -m <slug>`
- Effort: `exec -c model_reasoning_effort="<level>"`

### Claude Code (`claude`)

- Delegate: `bridge run claude -- -p "<task>" --output-format json`
- Models: aliases such as `opus`, `sonnet`, and `haiku`, or a full model name
- Model: `--model <alias or name>`
- Effort: `--effort <level>`
<!-- agents:end -->

## Repository skill (Codex Cloud)

Codex Cloud cannot install user skills. Only when the user asks, run
`bridge skill --repo` to write this skill to
`.agents/skills/agent-bridge/SKILL.md`; the user reviews and commits it, and
later tasks load it. Otherwise, `bridge skill --print` shows it in the
current task.
