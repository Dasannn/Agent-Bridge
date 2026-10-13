# Agent-Bridge Constitution

This document defines the non-negotiable principles of Agent-Bridge. It is the
highest source of truth in this repository. When any other document, plan, or
task conflicts with it, this document wins.

## Purpose

Agent-Bridge lets a primary coding agent running in a cloud container (such as
Claude Code on the web or Codex Cloud) authenticate other coding-agent CLIs
(such as OpenCode or Antigravity) with the user's own subscriptions, so the
user can delegate tasks to them from the cloud session.

It exists because those CLIs expect a browser on the same machine to complete
their login flow, and a user at home cannot reach a cloud container's
localhost or terminal directly.

Agent-Bridge is an open-source tool for individual users acting on their own
accounts. It is not a hosted service and does not broker credentials between
people.

## Principles

### 1. Agent-operated, human-approved

The primary agent runs Agent-Bridge, and the human authorizes it. Every
command must be usable non-interactively by an agent, and every step that
needs the human must produce a message the agent can relay verbatim.

### 2. Credentials never leave the container

Agent-Bridge never sends credentials, authorization codes, or tokens anywhere
except to the CLI being authenticated, or to that CLI's callback on the
container's own loopback interface. It never logs secrets and never stores
them outside the location the CLI itself uses.

### 3. Delegation only on explicit request

Agent-Bridge and its skill never cause the primary agent to delegate work on
its own initiative. The user decides when to delegate a task and to which
agent.

### 4. Respect the user's project process

When the user's project defines a workflow (for example a spec-driven
development flow in `AGENTS.md`, `CLAUDE.md`, or `docs/`), delegated work
follows it: the delegated task is tied to approved work, the subagent is told
to follow the project's rules and sources of truth, and the result is reviewed
against them before it is presented as done.

Agent-Bridge never writes files into the user's repository. Its own state
lives outside the project.

### 5. One adapter per CLI

Knowledge about a specific CLI lives only in that CLI's adapter. Supporting a
new CLI means adding an adapter, not changing the core.

### 6. Build only what is needed

Implement only the features, login strategies, and adapters required by the
current scope. Do not add speculative abstractions, options, or integrations.

### 7. Honest about provider terms

Agent-Bridge only automates logins that the official CLIs already offer. It
does not bypass authentication, extract tokens from other tools, or reuse
credentials across users. The documentation tells users to check each
provider's terms of service.

### 8. English only

All repository content is written in English: code, comments, documentation,
skills, commit messages, and pull requests.

## Governance

- Changes to this document require explicit approval from the project owner.
- Lower-priority documents (`docs/spec.md`, `ARCHITECTURE.md`, `docs/plan.md`,
  `docs/tasks.md`) must stay consistent with this document.
