# 0002: OpenCode

- Status: Accepted (GitHub Copilot blocked in Claude Code cloud containers)
- Date: 2026-10-14

## Context

Plan questions 1–5 for OpenCode. OpenCode is multi-provider; v1 targets its
free models (no login) and the ChatGPT and GitHub Copilot subscription
providers.

## Findings

Tested with OpenCode 1.19.0 in a Claude Code cloud container. Subscription
logins were started and their prompts recorded, but not completed, because
the project owner does not hold those subscriptions.

**Install.** `npm i -g opencode-ai` provides the `opencode` binary. On first
use OpenCode fetches its model catalog from `models.dev` and
`models.opencode.ai`; if these hosts are blocked it hangs on a spinner
instead of failing.

**Free models.** `opencode models opencode` lists free models (for example
`opencode/big-pickle`). `opencode run -m opencode/big-pickle "<task>"` works
with no login and exits `0`.

**Login command.** `opencode providers login` (alias `auth login`) is an
interactive picker: provider list with type-to-search, then a login method.
Keystrokes used: type the provider name, Enter, then arrows and Enter for the
method.

**ChatGPT (provider "OpenAI").** Three methods:

| Method | Flow | Details |
|---|---|---|
| ChatGPT Pro/Plus (headless) | Device code | Prints `Go to: https://auth.openai.com/codex/device` and `Enter code: XXXX-XXXXX`, then polls |
| ChatGPT Pro/Plus (browser) | Loopback callback | Redirect URI `http://localhost:1455/auth/callback`; a listener on port 1455 is open while waiting |
| Manually enter API Key | API key | Out of scope (API keys never go through the chat) |

**GitHub Copilot.** After choosing `GitHub.com`, OpenCode fails with
`Failed to initiate device authorization`. In Claude Code cloud containers,
HTTPS traffic to `github.com` is handled by the platform's GitHub proxy,
which rejects the device-authorization endpoints. This is an environment
limitation, not an OpenCode one; it may work in Codex Cloud or other
environments.

**Authentication check.** `opencode providers list` prints the credential
store path (`~/.local/share/opencode/auth.json`) and the connected providers
by name, without secrets. Its output is decorated with ANSI codes and must be
stripped before parsing.

**Delegation.** `opencode run "<task>"` runs non-interactively. Useful flags:
`-m provider/model`, `--format json` (newline-delimited JSON events ending in
`step_finish`), `--dir`, `--agent`, and `--auto` (auto-approve permissions
not explicitly denied). Exit code `0` on success.

**Project rules.** OpenCode reads `AGENTS.md` from the working directory
(verified with a rule that changed its answer).

**Terms.** OpenCode's ChatGPT login identifies itself with
`originator=opencode` and uses the Codex OAuth client, so OpenAI is aware of
this integration. Users remain responsible for their providers' terms.

## Decision

- `requiresLogin: false`. OpenCode is ready once installed, using free
  models.
- Provider `openai`: strategy `device-code`, using the headless method, which
  needs no pasted response and no loopback trick. `isAuthenticated` checks
  that `opencode providers list` names OpenAI.
- Provider `github-copilot`: kept in the adapter with strategy
  `device-code`, but `bridge login` reports a clear error when the
  device-authorization request fails, naming the environment limitation.
- The `loopback-callback` strategy is not needed by any v1 provider and is
  not implemented in v1.
- `binaries`: `["opencode"]`.
- Delegation example: `opencode run "<task>" --format json --auto`.

## Consequences

- v1 implements two strategies: `paste-code` (Antigravity) and `device-code`
  (OpenCode).
- The README lists the required hosts: `models.dev`, `models.opencode.ai`,
  `opencode.ai`, and `auth.openai.com` for ChatGPT.
- A real ChatGPT login must be verified by a volunteer or in the release
  checklist.
