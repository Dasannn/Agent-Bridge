# 0008: Portable Home for Read-Only Home Directories

- Status: Accepted (design; to be verified in Phase 3)
- Date: 2026-10-14

## Context

Decision 0007 found that Codex Cloud tasks run with a read-only `$HOME`,
read-only `~/.local`, and failing `npm i -g`; only `/tmp` and `/workspace`
are writable. Every supported CLI installs into, and stores credentials
under, the home directory.

## Decision

Agent-Bridge supports a portable home: a writable directory that stands in
for the home directory of the CLIs it manages.

- Location: `AGENT_BRIDGE_HOME` if set, otherwise `~/.agent-bridge` when the
  home directory is writable, otherwise `/tmp/agent-bridge`. Agent-Bridge
  never uses `/workspace` or the repository for this.
- Installs go under the portable home (`npm --prefix`, and the Antigravity
  installer's `--dir`), and its `bin` directory is placed first on `PATH`
  for managed processes.
- Managed processes (login, status checks, delegation) run with `HOME`,
  `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, and
  `CLAUDE_CONFIG_DIR` pointing inside the portable home, only when the real
  home is not writable.
- Delegation goes through `bridge run <agent> -- <args...>`, which applies the
  same environment, so the primary agent never has to set it. The skill uses
  `bridge run` in all environments, so one skill text works everywhere.
- Users can set `AGENT_BRIDGE_HOME` once in the environment's variables
  (Codex Cloud offers this) so the location is stable.

## Consequences

- Spec gains the `run` command and the portable-home rules.
- Credentials in `/tmp` live only as long as the container, which matches the
  accepted "log in each session" scope.
- Phase 3 verifies each CLI honors the redirected variables.
