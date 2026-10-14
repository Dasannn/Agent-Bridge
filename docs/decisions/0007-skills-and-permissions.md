# 0007: Skills and Permissions in Cloud Agents

- Status: Blocked for Codex Cloud skill loading; Claude Code cloud pending
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

Codex officially reads repository skills from `.agents/skills/` in each
directory from the working directory up to the repository root.

### Claude Code cloud

Pending: the owner's probe with a setup script that writes
`~/.claude/skills/agent-bridge-probe/SKILL.md`.

## Decision

Provisional, for the Phase 0 review:

- Codex Cloud cannot yet be configured to load a user-level skill from the
  environment settings. The reliable path is a repository skill at
  `.agents/skills/agent-bridge/SKILL.md`, which the user adds to their own
  repository.
- Agent installation of CLIs in Codex Cloud happens in the agent phase
  (`npx -y @dasannn/agent-bridge setup ...` run by the agent), because the
  install script's output is not visible to the agent.
- Codex Cloud requires *Allow Codex to access internet* with at least the
  provider hosts allowed.

## Consequences

- The project owner approved a narrow exception to constitution principle
  4: `bridge skill --repo` writes only `.agents/skills/agent-bridge/SKILL.md`,
  on explicit request, and never commits (spec FR-6a).
- The README documents the Codex Cloud internet setting and host list.
