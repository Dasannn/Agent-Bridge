# 0015: Opt-in Run Observer

- Status: Accepted
- Date: 2026-10-19

## Context

AgentStation (the owner's private agent office) shows, live, what each
coding agent in a cloud session is doing. Agents started with `bridge run`
are invisible to it: `run` spawns the CLI with `stdio: "inherit"` and keeps
no record. Wrapping the CLIs on `PATH` was considered and rejected as
fragile (PATH order, interference with logins and other uses).

## Decision

Add an opt-in observer to `bridge run` (spec FR-5b), enabled only by
`AGENT_BRIDGE_EVENTS`. When set, stdout is piped and tee'd to the terminal,
and `start`, batched `lines`, and `exit` are POSTed to a loopback URL.
Parsing of each CLI's JSON stream stays in the observer, so Agent-Bridge
remains CLI-agnostic.

## Consequences

- No change at all for users who do not set the variable.
- With the variable set, stdout is a pipe instead of the terminal; CLIs that
  detect a TTY on stdout may change formatting. Delegations use
  non-interactive JSON modes, where this does not matter; documented in the
  README.
- Raw output lines leave the process only to a loopback address.
