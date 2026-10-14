# 0010: Login by Link, and Model and Effort Selection

- Status: Accepted
- Date: 2026-10-14

## Context

ChatGPT's device-code login asks the user to type a code and, on many
accounts, to enable device-code sign-in in ChatGPT's security settings first.
The owner asked for a login by link instead. Codex and OpenCode both offer
one: they print an OpenAI sign-in URL whose `redirect_uri` points at a
listener in the container (`http://127.0.0.1:1455/auth/callback` for Codex,
`http://localhost:1455/auth/callback` for OpenCode). Constitution principle 2
already allows delivering credentials to a CLI's callback on the loopback
interface.

The owner also asked that the primary agent can choose the model and the
reasoning effort of each delegated CLI.

## Decision

**Login by link.** A new strategy, `loopback-callback`:

1. `bridge login` relays the sign-in URL and asks the user to paste, after
   signing in, the full address of the page their browser could not open.
2. `bridge complete` accepts that address only if its host is `localhost` or
   `127.0.0.1` and its port and path match the login URL's `redirect_uri`,
   its `state` matches the login URL's `state`, and it carries a `code` or an
   `error`. Otherwise it is rejected and the login keeps waiting.
3. The runner requests the address from the CLI's listener on `127.0.0.1`,
   then waits for the CLI to report a signed-in account.

It is the default for Codex and OpenCode's `openai` provider. Their
device-code logins remain available with `bridge login ... --device`.
OpenCode stays usable without any login through its free models; its
subscription logins are optional.

**Model and effort.** The skill (Phase 4) teaches the primary agent these
options. It passes them on each delegation and never writes a CLI's
configuration.

| CLI | List models | Model | Effort |
|---|---|---|---|
| OpenCode | `opencode models [provider] [--verbose]`; free models are `opencode/*`, and `--verbose` lists each model's variants | `run -m provider/model` | `run --variant <name>`, from the model's variants; ignored by models without variants |
| Antigravity | `agy models` | `--model` | `--effort low\|medium\|high\|xhigh\|max` |
| Codex | `codex debug models` (JSON with `slug` and `supported_reasoning_levels`) | `exec -m <slug>` | `exec -c model_reasoning_effort="<level>"` |
| Claude Code | aliases such as `opus` and `sonnet`, or a full model name | `--model` | `--effort <level>` |

## Verification

- Codex, live with the owner's ChatGPT account in portable mode:
  1. The link login completed in about 3 seconds.
  2. `bridge run codex -- exec ...` read `AGENTS.md`.
  3. `bridge logout codex` signed out.
- OpenCode: the link prompt was captured (`test/fixtures/opencode-openai-link.txt`).
  `run -m opencode/big-pickle --variant high` answered from `AGENTS.md`.
- Still to verify in Phase 4:
  - the Codex effort override on a real run;
  - Claude Code's options from a non-Claude host.

## Consequences

- The pasted address carries an authorization code. It is treated like a
  pasted code: never logged, stored, or echoed, and masked in errors.
- On some mobile browsers the address of a page that failed to load is hard
  to copy. `--device` remains for those users.
- GitHub logins (OpenCode's Copilot provider) cannot be tested inside Claude
  Code on the web: its proxy only allows GitHub requests for the session's
  repositories. They will be tested in Codex Cloud.
