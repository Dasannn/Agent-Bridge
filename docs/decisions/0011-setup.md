# 0011: Setup in Cloud Environments

- Status: Accepted (Claude Code on the web verified by probe; full run in Task 4.7)
- Date: 2026-10-14

## Context

Task 4.1 left four questions for `bridge setup`:

1. Can the host be detected from inside a setup script?
2. What permission rule syntax should be used?
3. How should the `/bridge-code` command be built?
4. How can the package be installed before release?

## Findings

**Host detection.** A probe setup script in Claude Code on the web listed
the environment variable names it sees. They include
`CLAUDE_CODE_ENTRYPOINT` and `CLAUDE_CODE_REMOTE`, but not `CLAUDECODE`. The
existing detection (`CLAUDECODE` or `CLAUDE_CODE_ENTRYPOINT`) therefore
already recognises Claude Code at setup time, so no `--host` option is
needed. Codex Cloud runs no setup script that the agent can see (decision
0007).

**Permission rules.** The Claude Code documentation gives
`Bash(<command> *)` as the form for a command with any arguments. It also
accepts `Bash(<command>:*)` as an equivalent. A trailing ` *` also matches
the bare command. Compound commands need every part to be allowed.

The documentation also says that cloud sessions do not read
`~/.claude/settings.json` "from your machine". Files the setup script writes
inside the session's VM are a different case. A skill written that way loads
(decision 0007), and a command written that way runs (below). Whether the
allow rules written that way take effect is checked in Task 4.7.

**`/bridge-code`.** The probe script wrote
`~/.claude/commands/abcode.md`, with `allowed-tools` and the line
``!`abcontrol '$ARGUMENTS'` ``. Typing `/abcode hola&x=1` in a new session
printed `ABCONTROL RAN: hola&x=1`. So the command loads, its shell line runs,
and the single quotes keep the `&` of a callback address. The model still
answers once after the command runs, so the command asks it to answer in one
short sentence.

**Installing before release.**
- `npx -y github:dasannn/agent-bridge#<branch>` builds through the `prepare`
  script and runs.
- `npm install -g` of the same Git reference fails with npm 10 and 11: the
  `prepare` step cannot find `tsc`.
- A local install into a fixed directory works:
  `npm install --prefix <dir> github:...`, then a link from
  `<dir>/node_modules/.bin/bridge` into a `PATH` directory.

After release, `npm install -g cloud-agent-bridge` installs the published
build and runs no `prepare` step.

## Decision

- `bridge setup` detects the host from the environment.
- It writes these files into the agent's home:
  - `~/.claude/skills/agent-bridge/SKILL.md`;
  - `~/.claude/commands/bridge-code.md`;
  - `Bash(<name> *)` allow rules in `~/.claude/settings.json`.
- It warns when `bridge` itself is not on `PATH`, because the agent could not
  run it.
- The pre-release setup script for Claude Code on the web is:

  ```bash
  npm install --prefix /opt/agent-bridge "github:dasannn/agent-bridge#<branch>"
  ln -sf /opt/agent-bridge/node_modules/.bin/bridge /usr/local/bin/bridge
  bridge setup --agents opencode,agy,codex
  ```
