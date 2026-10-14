# Agent-Bridge

Use your own subscriptions to other coding agents from a cloud coding agent.

Agent-Bridge (`bridge`) runs inside a cloud session of **Claude Code on the
web** or **Codex Cloud**. It logs other coding-agent CLIs in with your
accounts by relaying the login through the chat. Your primary agent can then
delegate tasks to those CLIs when you ask.

| CLI | Login | Subscription |
|---|---|---|
| [OpenCode](https://opencode.ai) | none for its free models; optional ChatGPT or GitHub Copilot | free, ChatGPT, Copilot |
| Antigravity (`agy`) | Google sign-in, paste a code | Google |
| Codex | ChatGPT sign-in by link, or `--device` for a device code | ChatGPT |
| Claude Code | Claude sign-in, paste a code | Claude |

The agent you are working in is never offered as a target. Inside Claude
Code, Claude Code is excluded; inside Codex, Codex is.

> [!WARNING]
> **Antigravity:** there are reports of Google accounts being restricted
> after Antigravity was used outside its official apps. Use it at your own
> risk, preferably with an account you can afford to lose access to.
>
> **All providers:** review each provider's terms before using your
> subscription this way. You are responsible for how you use your accounts.

## What it looks like

> **You:** Connect Antigravity.
>
> **Agent:** Open this URL in your browser, sign in, and paste the code you
> are shown back here: `https://accounts.google.com/...`
>
> **You:** `/bridge-code 4/0AX...`
>
> **Agent:** Signed in to Antigravity.
>
> **You:** Delegate to Antigravity with effort high: summarize
> `docs/constitution.md` in three lines.
>
> **Agent:** *(runs Antigravity, shows its answer and `git status`)*

Delegation happens only when you ask. If your project defines a workflow (for
example `AGENTS.md` and a task list), the agent ties delegated work to it,
tells the delegated CLI to follow the project's rules, and reviews the
result.

## Set up Claude Code on the web

1. Open your cloud environment's settings (the environment menu, then
   **Edit**).
2. Paste this as the **setup script**. List the CLIs you want and leave out
   `claude`, because it is the host:

   ```bash
   npm install -g cloud-agent-bridge
   bridge setup --agents opencode,agy,codex
   ```

3. Under **Network access**, allow the hosts of the CLIs you use (see
   [Network](#network)), or choose full access.

Every new session then has, without further steps:

- the CLIs, installed;
- the `agent-bridge` skill;
- the `/bridge-code` command;
- permission for the agent to run `bridge` and the CLIs without asking.

`bridge setup --no-permissions` skips the permission rules.

## Set up Codex Cloud

Codex Cloud has a read-only home directory and no user skills, so Agent-Bridge
is installed inside each task.

1. In the environment's settings, turn on **internet access** for the agent,
   and allow the hosts of the CLIs you use (see [Network](#network)) or all
   domains.
2. Start a task with:

   ```text
   Install Agent-Bridge with
   `npm_config_cache=/tmp/npm-cache npm install --prefix /tmp/ab cloud-agent-bridge`,
   use /tmp/ab/node_modules/.bin/bridge wherever the skill says `bridge`,
   then run `bridge skill --print` and follow it for this task.
   ```

To avoid pasting that every time, ask the agent once to run
`bridge skill --repo`. It writes `.agents/skills/agent-bridge/SKILL.md` into
your repository. Review and commit that file; Codex loads it at the start of
later tasks, and it tells the agent how to install Agent-Bridge.

## Use it

Ask your agent in plain words. Under the hood it runs:

| You ask | The agent runs |
|---|---|
| "Which CLIs can I use?" | `bridge status` |
| "Connect Antigravity" | `bridge login agy`, then relays the message |
| *(you paste a code or address)* | `bridge complete "<what you pasted>"` |
| "Connect ChatGPT in Codex" | `bridge login codex` (add `--device` for a device code) |
| "Connect Copilot in OpenCode" | `bridge login opencode --provider github-copilot` |
| "Delegate to Codex: …" | `bridge run codex -- exec "<task>" …` |
| "Switch my Codex account" | `bridge logout codex`, then `bridge login codex` |

**Pasting codes.** In Claude Code, `/bridge-code <code or address>` finishes
a login in one step. You can also paste it in the chat.

**ChatGPT logins by link.** After you sign in, your browser shows an error
page for `localhost` or `127.0.0.1`. That is expected: the address points at
the cloud machine. Copy the full address from the address bar and paste it.
If your browser makes that hard (some phones), ask for the device-code login
instead.

**OpenCode** works without any login, with its free models. Its ChatGPT and
Copilot logins are optional.

**Models and effort.** Ask for a model or a reasoning effort ("use Codex
with gpt-5.6-luna and effort low", "use OpenCode with a free model"), or ask
which models are available. The agent passes the choice on each delegation
and keeps it for the rest of the conversation. It never edits the CLIs'
configuration.

## Limits

- **Logins last as long as the cloud session's container.** A new session
  needs a new login. If the container restarts while a login is pending, the
  code you were given stops working; ask the agent to connect again.
- **GitHub logins (Copilot) do not work inside Claude Code on the web**,
  whose network proxy only allows GitHub requests for the session's
  repositories. They work in Codex Cloud.
- **Claude Code as a delegate** only makes sense outside Claude Code, for
  example from Codex Cloud.
- Linux containers with Node.js 20 or later.

## Network

Each CLI needs its provider's hosts, plus `registry.npmjs.org` for installs:

| CLI | Hosts |
|---|---|
| OpenCode | `opencode.ai`, `models.dev`, and the hosts of the providers you connect |
| Antigravity | `antigravity.google`, `*.googleapis.com` |
| Codex | `auth.openai.com`, `chatgpt.com`, `api.openai.com` |
| Claude Code | `claude.ai`, `anthropic.com`, `*.anthropic.com` |
| GitHub Copilot | `github.com`, `api.github.com`, `*.githubcopilot.com` |

If a login or delegation fails with a network error, Agent-Bridge says so;
allowing the CLI's hosts, or full access, fixes it.

## Security

- Codes and callback addresses you paste go only to the CLI being logged
  in: to its input, or to its login listener on the container's own
  loopback interface. They are never logged, stored, or echoed, and they are
  masked in error messages.
- Credentials stay where each CLI keeps them, inside the container.
  Agent-Bridge never reads, copies, or edits them.
- Agent-Bridge never asks for API keys. Put any API key in your cloud
  environment's secrets instead.
- Agent-Bridge writes nothing into your repository, except the skill file
  written by `bridge skill --repo` when you ask for it.
- `bridge setup` adds `Bash(<command> *)` allow rules for `agent-bridge`,
  `bridge`, and the CLIs you listed, in `~/.claude/settings.json`. It keeps
  your other settings.
- Signing out of Antigravity goes through its first-run setup screens.
  Agent-Bridge answers them with data sharing with Google turned **off**.

Where the home directory is read-only (Codex Cloud), Agent-Bridge keeps the
CLIs and their logins in the temporary directory (usually
`/tmp/agent-bridge`), or under `AGENT_BRIDGE_HOME` if you set it.

## Commands

```text
bridge setup --agents <list> [--no-permissions]
bridge status [agent] [--json]
bridge login <agent> [--provider <id>] [--device] [--json]
bridge complete [<agent>] [--provider <id>] ["<code or address>"] [--json]
bridge logout <agent> [--provider <id>] [--json]
bridge run <agent> -- <arguments for the CLI>
bridge skill --print | --repo
```

`agent-bridge` is the same command as `bridge`.

## Development

The project follows a spec-driven workflow; see `AGENTS.md` and `docs/`.

```bash
npm ci
npm run build
npm test
npm run lint
```

## License

[MIT](LICENSE)
