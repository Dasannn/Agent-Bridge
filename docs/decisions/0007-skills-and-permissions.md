# 0007: Skills and Permissions in Cloud Agents

- Status: Accepted
- Date: 2026-10-14

## Context

Plan questions 7 and 8: where cloud agents load user skills, whether a skill
installed by an environment's setup step is visible to the agent, and how
command permissions are granted.

## Findings

### Codex Cloud

Four probe runs by the project owner, in an environment whose settings page
shows **Install script**, **Start skill**, and **Internet access** (a newer
layout than the documented *Setup script* and *Maintenance script*).

- **Skill directories.** In the agent phase, `CODEX_HOME` is
  `/run/codex-environment/codex-home` and has no `skills` directory;
  `~/.codex/skills` contains only `builtins` and `remote-skills`.
- **Install script.** The settings page shows the script on a single line.
  Neither a multi-line script nor a single-line script separated by `;`
  produced its files or a marker in `$HOME` visible to the agent. Either the
  script did not run, or it ran in a phase whose filesystem the agent does
  not see.
- **Start skill.** Pasting a `SKILL.md` body into this field was followed by
  the environment failing to start. The loaded skills reported by the agent
  were `cloud-environment-onboarding:setup` and one custom-instructions
  skill, which suggests the field expects a reference to an existing skill,
  not skill content.
- **Network.** With *Allow Codex to access internet* off, only the npm
  registry was reachable from the agent. With it on and *Allow domains* set
  to *All*, `auth.openai.com`, `antigravity.google`, and `opencode.ai`
  returned `200`.
- **Secrets.** Third-party documentation states that Codex Cloud removes
  secrets from the environment when the agent phase starts.

Further probes inside a Codex Cloud task (follow-up messages in one task):

- The task sandbox uses permission profile `:workspace`. Writable: `/tmp`
  and `/workspace`. Read-only: `$HOME` (`/home/agent`), `~/.codex`,
  `~/.local`, and `$CODEX_HOME`. `/workspace/.agents`, `/workspace/.codex`,
  and `/workspace/.git` are empty read-only mounts.
- The repository is checked out at `/workspace/<repo>`, not `/workspace`.
- `npm i -g` fails because the npm prefix is `~/.local`.
- Writing `~/.codex/skills/...` fails (read-only file system).
- Writing `/workspace/<repo>/.agents/skills/agent-bridge-probe/SKILL.md`
  succeeds, but the skill is not loaded later in the same task: Codex reads
  skills when a task starts.
- The environment settings offer persistent environment variables.

Codex officially reads repository skills from `.agents/skills/` in each
directory from the working directory up to the repository root, at task
start. Loading a committed repository skill in a new task was not tested,
because Codex Cloud tasks run on the default branch and this project does not
write to `main` during Phase 0.

### Claude Code cloud

Verified. A setup script that writes
`~/.claude/skills/agent-bridge-probe/SKILL.md` makes the skill available in
new sessions: the agent answered the probe question from the loaded skill and
named its path (`/root/.claude/skills/agent-bridge-probe`). The setup script
runs before the agent starts and its home directory is the agent's.

## Decision

- **Claude Code cloud:** `bridge setup` in the environment setup script
  installs the skill to `~/.claude/skills/agent-bridge/` and grants
  permissions in `~/.claude/settings.json`. Verified.
- **Codex Cloud:** user-level skills are not possible. Two paths, both
  supported:
  1. Persistent: `bridge skill --repo` writes
     `.agents/skills/agent-bridge/SKILL.md`; the user commits it to the
     default branch, and later tasks load it at start (official behavior, to
     be verified at release).
  2. Fallback, always available: the agent runs `bridge skill --print` and
     follows the printed instructions in the current task.
- **Codex Cloud runtime:** Agent-Bridge cannot install globally or write to
  `$HOME`, so it uses a portable home (see decision 0008).
- Codex Cloud requires *Allow Codex to access internet* with the provider
  hosts allowed. Codex has no per-command permission list, so `setup` skips
  the permissions step there.

## Consequences

- The project owner approved a narrow exception to constitution principle
  4: `bridge skill --repo` writes only `.agents/skills/agent-bridge/SKILL.md`,
  on explicit request, and never commits (spec FR-6a).
- The README documents the Codex Cloud internet setting and host list.
