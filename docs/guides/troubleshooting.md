# Troubleshooting

## The browser shows an error page for localhost or 127.0.0.1

This is expected for ChatGPT logins by link. The address points at the cloud
container. Copy the full address from the browser's address bar and paste it
in the chat, or use `/bridge-code <address>` in Claude Code. If copying it is
hard, restart with `bridge login <agent> --device` (and `--provider openai`
for OpenCode).

## No login is in progress

If the login process exited or the container restarted, start again with
`bridge login <agent>`. A container restart cancels a pending login.

## The pasted code or address is rejected

The login keeps waiting after invalid input. Paste again, with the full code
or address. A callback address must match the login's redirect address and
state. Follow the login message's instructions.

## The provider rejected or expired the code

Restart the login with `bridge login <agent>` and follow the new message.

## A network error during login or delegation

Allow the CLI's hosts in the environment's network settings. See the
[README Network section](../../README.md#network).

## GitHub Copilot does not work in Claude Code on the web

Its network proxy only allows GitHub requests for the session's
repositories. GitHub Copilot logins work in Codex Cloud.

## `bridge` is not found

In Claude Code on the web, use the
[README setup script](../../README.md#set-up-claude-code-on-the-web).
In Codex Cloud, use the [README install prompt](../../README.md#set-up-codex-cloud)
and `/tmp/ab/node_modules/.bin/bridge` wherever the skill says `bridge`.

## Permission prompts keep appearing in Claude Code

`bridge setup --agents <list>` grants rules for Agent-Bridge and the listed
CLIs. `--no-permissions` skips those rules. See the
[README setup instructions](../../README.md#set-up-claude-code-on-the-web).

## An account ran out of usage

Run `bridge logout <agent>`, then `bridge login <agent>` to switch accounts.
For OpenCode, include `--provider <id>` in both commands.

## The CLI canary failed

Read the failing job's CLI output and follow the
[release guide](release.md#when-the-cli-canary-fails).
