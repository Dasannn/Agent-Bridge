# 0003: Antigravity CLI (`agy`)

- Status: Accepted (terms-of-service risk to be reviewed by the project owner)
- Date: 2026-10-14

## Context

Plan questions 1–5 for Antigravity: install, login flow, authentication
check, non-interactive invocation, and `AGENTS.md` support.

## Findings

Tested with `agy` 1.3.4 in a Claude Code cloud container, with a real login
by the project owner.

**Install.** `curl -fsSL https://antigravity.google/cli/install.sh | bash`
downloads a native binary (about 215 MB), verifies its SHA-512 against a
manifest, installs it to `~/.local/bin/agy`, and appends a `PATH` export to
`~/.bashrc`, `~/.zshrc`, and `~/.profile`. The CLI self-updates in the
background. Required hosts: `antigravity.google` and
`antigravity-cli-auto-updater-974169037036.us-central1.run.app`.

**Login flow: paste code.** Google OAuth with PKCE. The redirect URI is
`https://antigravity.google/oauth-callback`, a hosted page that shows the
authorization code to the user. There is no loopback callback.

- Print mode (`agy -p ...` while logged out) prints the URL and accepts a
  pasted code, but has a fixed 60-second timeout, after which it exits with
  `Error: authentication timed out.` (exit code 1). No setting changes it.
  60 seconds is too short to relay a URL and a code through a chat.
- The interactive TUI (`agy` with no arguments) shows a menu
  (`1. Google OAuth`, `2. Use a Google Cloud project`); after choosing 1 it
  prints the same URL and `paste the authorization code below`, with no
  visible timeout. A code pasted about four minutes later was accepted.
- The TUI queries the terminal (primary device attributes, XTVERSION,
  DECRQM, OSC 11) and waits for replies before drawing. A bare pseudo-terminal
  that does not answer leaves it blank. Running it inside `tmux` works.
- After login, the TUI continues into first-run onboarding (theme picker).
  Credentials are already saved at that point, so the session can be closed.

**Credentials.** Stored in `~/.gemini/antigravity-cli/antigravity-oauth-token`
(mode `0600`). Agent-Bridge does not read this file.

**Authentication check.** `agy models` exits `0` and lists models when logged
in, and exits `1` with `Please sign in to view available models` when logged
out. It needs no TTY and prints no secrets.

**Delegation.** `agy -p "<task>"` runs one turn non-interactively. Useful
flags: `--output-format json` (single JSON object with `status`, `response`,
`usage`), `--dangerously-skip-permissions` (auto-approve tool use),
`--mode accept-edits|plan`, `--model`, `--add-dir`, and `--print-timeout`.
A test prompt returned `"status":"SUCCESS"` with exit code `0`.

**Project rules.** `agy` reads both `AGENTS.md` and `GEMINI.md` from the
working directory (verified with a rule that changed its answer).

**Terms of service.** No official statement on automated or remote use of
the CLI was found. Community reports describe accounts blocked with
`Service disabled for violation of Terms of Service` (HTTP 403), including
users of orchestrators that invoke `agy -p`, and Google staff quoting a term
against using the service "in connection with products not provided by us".
Sources:
<https://discuss.ai.google.dev/t/is-a-local-single-user-orchestrator-allowed-to-invoke-the-official-agy-p-cli/179013>,
<https://discuss.ai.google.dev/t/appeal-request-agy-antigravity-cli-service-disabled-for-violation-of-terms-of-service-code-403/172603>.

## Decision

- Strategy: `paste-code`.
- Login is driven through the interactive TUI, not print mode, because of
  print mode's 60-second timeout. The adapter selects menu option 1 and
  writes the pasted code followed by Enter.
- The session runner must give the TUI a terminal that answers terminal
  queries (see decision 0004).
- `isAuthenticated`: `agy models` exit code.
- `binaries`: `["agy"]`. Install uses the official script.
- Delegation example:
  `agy -p "<task>" --output-format json --dangerously-skip-permissions`.

## Consequences

- The README must list the required hosts and warn clearly about the
  Antigravity terms-of-service risk; the project owner decides at the Phase 0
  review whether v1 keeps the Antigravity adapter.
- The skill should tell the primary agent that `agy` reads `AGENTS.md`, so it
  does not need to repeat project rules in the prompt, only point to them.
- Because the installer edits shell profiles, `bridge setup` should call it
  as-is rather than reimplementing it.
