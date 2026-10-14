# 0009: Adapter Verification in a Cloud Container

- Status: Accepted
- Date: 2026-10-14

## Context

Phase 3 requires each adapter to be proven live in a cloud container, and
decision 0008 requires each CLI to honour the portable home's redirected
variables. All runs below used portable mode, as in Codex Cloud: `HOME`
pointed at a path that does not exist, `AGENT_BRIDGE_HOME` under `/tmp`, and
a `PATH` holding only Node.js and the system directories, so every CLI was
installed by Agent-Bridge into `<root>/prefix`.

## Results

| CLI | Install | Login prompt | Login completed | Status | Logout | Delegation via `bridge run` |
|---|---|---|---|---|---|---|
| Antigravity | official script, ~6 s | yes | yes (owner) | yes | yes | yes, read `AGENTS.md` |
| Codex | npm | yes (device code and link) | yes (owner, by link; decision 0010) | yes | yes | yes, read `AGENTS.md` |
| OpenCode | npm | yes (OpenAI device code and link) | ChatGPT yes (owner, by link); Copilot yes (owner, Codex Cloud) | yes | yes (ChatGPT) | yes, free, ChatGPT, and Copilot models |
| Claude Code | npm | yes (Phase 3.4) | yes (owner, Codex Cloud) | yes | not tried | yes, with model and effort (Codex Cloud) |

Each CLI that ran kept its configuration and credentials inside the portable
home: Codex under `<root>/home/.codex`, OpenCode under the redirected XDG
directories, and Antigravity under `<root>/home/.gemini`. Claude Code was not
checked, because inside Claude Code it is the host agent and every `claude`
process is authenticated by the platform (decision 0006).

## Findings that changed the code

- **Antigravity stays open after a successful login** and moves on to its own
  setup. The runner now polls `isAuthenticated` while the CLI runs, instead
  of waiting for it to exit.
- **Antigravity has no logout command.** `agy -p /logout` is refused ("not
  available in print mode"), and the interactive interface accepts `/logout`
  only after a first-run setup:
  1. a welcome screen with a colour scheme;
  2. "Terms of Service & Data Use", with a checkbox to share interaction data
     with Google that is on by default;
  3. a prompt to trust the working folder.

  By the owner's decision, `bridge logout agy` completes this setup with data
  sharing turned off, never confirms it while sharing is on, and trusts an
  empty scratch folder. The README must state this.
- **OpenCode drops keys typed before its menus are drawn.** Key steps wait for
  their screen text (`KeyStep.after`).
- **OpenCode's first start downloads its model catalogue**, so the prompt
  timeout is 90 seconds.
- **A pasted code without the agent name** (`bridge complete "<code>"`) is
  delivered to the only login in progress; it signed in to Antigravity in
  about 4 seconds.

## Consequences

- A container restart stops a pending login, and its code can no longer be
  used; the user must log in again. The README and skill should say so.
- Claude Code and OpenCode's Copilot provider were logged in and delegated
  to from Codex Cloud, where GitHub is reachable and Claude Code is not the
  host (decision 0011).
