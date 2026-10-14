import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { constants } from "node:os";
import { dirname, join, relative } from "node:path";
import { type Adapter, type LoginProvider, loginMethod, type Registry } from "../core/adapter.js";
import { detectHost } from "../core/host.js";
import { type CommandResult, mask } from "../core/output.js";
import { type BridgeHome, managedEnv, resolveHome } from "../core/paths.js";
import { completeLogin, loginInProgress, startLogin } from "../core/session.js";
import { isAgentBridgeSkill, readSkill } from "../core/skill.js";
import { callbackTarget } from "../core/strategies.js";

export interface Deps {
  env: NodeJS.ProcessEnv;
  registry: Registry;
  /** Overrides for tests; default to the built-in runner and adapters. */
  runnerPath?: string;
  adapterModule?: string;
  /** Working directory, for `skill --repo`; defaults to the process's. */
  cwd?: string;
}

interface Context {
  deps: Deps;
  home: BridgeHome;
  cliEnv: NodeJS.ProcessEnv;
}

const NETWORK_HINT =
  "If the CLI could not reach its provider, the environment's network policy may need to allow the provider's hosts.";

const HOST_NAMES = { claude: "Claude Code", codex: "Codex" } as const;

const fail = (message: string, data?: Record<string, unknown>): CommandResult => ({
  ok: false,
  message,
  data,
});

function context(deps: Deps): Context {
  const home = resolveHome(deps.env);
  return { deps, home, cliEnv: managedEnv(deps.env, home) };
}

function findAdapter(ctx: Context, id: string | undefined): Adapter | CommandResult {
  const known = ctx.deps.registry
    .list()
    .map((a) => a.id)
    .join(", ");
  if (!id) return fail(`Name an agent. Known agents: ${known}.`);
  const adapter = ctx.deps.registry.get(id);
  return adapter ?? fail(`Unknown agent: ${id}. Known agents: ${known}.`);
}

function hostRefusal(ctx: Context, adapter: Adapter): CommandResult | undefined {
  const host = detectHost(ctx.deps.env);
  if (host !== adapter.id) return undefined;
  return fail(
    `You are running inside ${HOST_NAMES[host]}, so Agent-Bridge does not manage ${adapter.displayName} here.`,
  );
}

function findProvider(
  ctx: Context,
  adapter: Adapter,
  id: string | undefined,
): LoginProvider | CommandResult {
  const provider = ctx.deps.registry.provider(adapter, id);
  if (provider) return provider;
  const ids = adapter.providers.map((p) => p.id).join(", ");
  if (adapter.providers.length === 0) return fail(`${adapter.displayName} has no login.`);
  return fail(
    id
      ? `Unknown provider ${id} for ${adapter.id}. Choose one with --provider: ${ids}.`
      : `${adapter.displayName} has several providers. Choose one with --provider: ${ids}.`,
  );
}

const isResult = (value: unknown): value is CommandResult =>
  typeof value === "object" && value !== null && "message" in value && "ok" in value;

function providerFlag(adapter: Adapter, provider: LoginProvider): string {
  return adapter.providers.length > 1 ? ` --provider ${provider.id}` : "";
}

async function providerState(ctx: Context, adapter: Adapter, provider: LoginProvider) {
  if (await provider.isAuthenticated(ctx.cliEnv)) return "authenticated";
  if (await loginInProgress(adapter.id, provider.id, ctx.home)) return "login in progress";
  return "not authenticated";
}

export async function status(deps: Deps, agent?: string): Promise<CommandResult> {
  const ctx = context(deps);
  let adapters = deps.registry.list();
  if (agent) {
    const found = findAdapter(ctx, agent);
    if (isResult(found)) return found;
    adapters = [found];
  }
  const host = detectHost(deps.env);
  const agents: Array<{ id: string; state: string; providers?: Record<string, string> }> = [];
  for (const adapter of adapters) {
    if (adapter.id === host) {
      agents.push({ id: adapter.id, state: "host" });
      continue;
    }
    if (!(await adapter.isInstalled(ctx.cliEnv))) {
      agents.push({ id: adapter.id, state: "not installed" });
      continue;
    }
    const providers: Record<string, string> = {};
    for (const provider of adapter.providers) {
      providers[provider.id] = await providerState(ctx, adapter, provider);
    }
    const ids = Object.keys(providers);
    let state: string;
    if (!adapter.requiresLogin) state = "ready (no login needed)";
    else if (ids.length === 1) state = providers[ids[0]];
    else state = "providers";
    agents.push({ id: adapter.id, state, ...(ids.length > 0 ? { providers } : {}) });
  }
  const lines = agents.map(({ id, state, providers }) => {
    const details =
      providers && Object.keys(providers).length > 1
        ? Object.entries(providers)
            .map(([p, s]) => `${p}: ${s}`)
            .join("; ")
        : "";
    if (state === "providers") return `${id}: ${details}`;
    return details ? `${id}: ${state} (${details})` : `${id}: ${state}`;
  });
  return { ok: true, message: lines.join("\n"), data: { agents } };
}

export async function login(
  deps: Deps,
  agent?: string,
  providerId?: string,
  device = false,
): Promise<CommandResult> {
  const ctx = context(deps);
  const adapter = findAdapter(ctx, agent);
  if (isResult(adapter)) return adapter;
  const refusal = hostRefusal(ctx, adapter);
  if (refusal) return refusal;
  const provider = findProvider(ctx, adapter, providerId);
  if (isResult(provider)) return provider;
  const method = loginMethod(provider, device);
  if (!method) return fail(`${adapter.displayName} has no device-code login.`);
  if (!(await adapter.isInstalled(ctx.cliEnv))) {
    try {
      await adapter.install(ctx.cliEnv);
    } catch (error) {
      const detail = mask(error instanceof Error ? error.message : String(error));
      return fail(`Could not install ${adapter.displayName}.\n${detail}\n\n${NETWORK_HINT}`);
    }
  }
  if (await provider.isAuthenticated(ctx.cliEnv)) {
    return { ok: true, message: `${adapter.displayName} is already authenticated.` };
  }

  const result = await startLogin({
    adapter,
    provider,
    home: ctx.home,
    env: ctx.cliEnv,
    runnerPath: deps.runnerPath,
    adapterModule: deps.adapterModule,
    promptTimeoutMs: Number(deps.env.AGENT_BRIDGE_PROMPT_TIMEOUT_MS) || undefined,
    device,
  });
  if (!result.ok) {
    const screen = result.screen ? `\n\nLast output from the CLI:\n${mask(result.screen)}` : "";
    return fail(
      `Could not start the ${adapter.displayName} login: ${result.error}${screen}\n\n${NETWORK_HINT}`,
    );
  }

  const flag = providerFlag(adapter, provider);
  const { url, code } = result.prompt;
  const command = `bridge complete ${adapter.id}${flag}`;
  let userMessage: string;
  let next: string;
  switch (method.strategy) {
    case "device-code":
      userMessage = `Open this URL in your browser, sign in, and enter the code ${code ?? "shown there"}:\n${url}\n\nTell me when you have finished.`;
      next = command;
      break;
    case "loopback-callback": {
      const target = callbackTarget(result.prompt);
      const start = target ? ` (it starts with ${target.origin}${target.path})` : "";
      userMessage = `Open this URL in your browser and sign in:\n${url}\n\nYour browser will then show an error page, because that address points at the cloud machine. That is expected: copy the full address from the address bar${start} and paste it back here.`;
      next = `${command} "<address>"`;
      break;
    }
    default:
      userMessage = `Open this URL in your browser, sign in, and paste the code you are shown back here:\n${url}`;
      next = `${command} "<code>"`;
  }
  return {
    ok: true,
    message: `Relay this message to the user exactly:\n\n${userMessage}\n\nThen run: ${next}`,
    data: { agent: adapter.id, provider: provider.id, url, code, next },
  };
}

/** Logins in progress, optionally limited to one agent or provider. */
async function loginsInProgress(
  ctx: Context,
  agent: string | undefined,
  providerId: string | undefined,
): Promise<Array<{ adapter: Adapter; provider: LoginProvider }>> {
  const found: Array<{ adapter: Adapter; provider: LoginProvider }> = [];
  for (const adapter of ctx.deps.registry.list()) {
    if (agent !== undefined && adapter.id !== agent) continue;
    for (const provider of adapter.providers) {
      if (providerId !== undefined && provider.id !== providerId) continue;
      if (await loginInProgress(adapter.id, provider.id, ctx.home)) {
        found.push({ adapter, provider });
      }
    }
  }
  return found;
}

export async function complete(
  deps: Deps,
  agent?: string,
  providerId?: string,
  response?: string,
): Promise<CommandResult> {
  const ctx = context(deps);
  const isAgent = (id: string | undefined) => id !== undefined && !!deps.registry.get(id);
  // Accept `complete "<code>"` and `complete "<code>" <agent>` as well. An unknown
  // agent next to a code is never echoed, because it may be the code.
  if (agent !== undefined && !isAgent(agent)) {
    if (isAgent(response)) [agent, response] = [response, agent];
    else if (response === undefined) [agent, response] = [undefined, agent];
    else {
      const known = deps.registry
        .list()
        .map((a) => a.id)
        .join(", ");
      return fail(`Unknown agent. Known agents: ${known}.`);
    }
  }
  const matches = await loginsInProgress(ctx, agent, providerId);
  let adapter: Adapter;
  let provider: LoginProvider;
  if (matches.length === 1) {
    ({ adapter, provider } = matches[0]);
  } else if (agent !== undefined) {
    const foundAdapter = findAdapter(ctx, agent);
    if (isResult(foundAdapter)) return foundAdapter;
    const foundProvider = findProvider(ctx, foundAdapter, providerId);
    if (isResult(foundProvider)) return foundProvider;
    adapter = foundAdapter;
    provider = foundProvider;
  } else if (matches.length === 0) {
    return fail("No login is in progress. Run `bridge login <agent>` first.");
  } else {
    const names = matches
      .map(({ adapter, provider }) => `${adapter.id}${providerFlag(adapter, provider)}`)
      .join(", ");
    return fail(
      `Several logins are in progress (${names}). Name one: bridge complete <agent> [--provider <id>] "<code>".`,
    );
  }
  const secrets = response ? [response, response.trim()] : [];

  const result = await completeLogin({
    agent: adapter.id,
    provider: provider.id,
    home: ctx.home,
    response,
  });
  switch (result.status) {
    case "no-session":
      return fail(
        `No ${adapter.displayName} login is in progress. Run \`bridge login ${adapter.id}${providerFlag(adapter, provider)}\` first.`,
      );
    case "rejected":
      return { ok: false, message: result.error, secrets };
    case "done":
      return result.ok
        ? { ok: true, message: `Signed in to ${adapter.displayName}.`, secrets }
        : {
            ok: false,
            message: `${result.message}\nRun \`bridge login ${adapter.id}${providerFlag(adapter, provider)}\` to try again.`,
            secrets,
          };
  }
}

export async function logout(
  deps: Deps,
  agent?: string,
  providerId?: string,
): Promise<CommandResult> {
  const ctx = context(deps);
  const adapter = findAdapter(ctx, agent);
  if (isResult(adapter)) return adapter;
  const refusal = hostRefusal(ctx, adapter);
  if (refusal) return refusal;
  const provider = findProvider(ctx, adapter, providerId);
  if (isResult(provider)) return provider;
  try {
    await provider.logout(ctx.cliEnv);
  } catch (error) {
    const detail = mask(error instanceof Error ? error.message : String(error));
    return fail(`Could not sign out of ${adapter.displayName}.\n${detail}`);
  }
  if (await provider.isAuthenticated(ctx.cliEnv)) {
    return fail(`${adapter.displayName} still reports a signed-in account.`);
  }
  return { ok: true, message: `Signed out of ${adapter.displayName}.` };
}

export async function run(
  deps: Deps,
  agent: string | undefined,
  args: string[],
  reportError: (result: CommandResult) => void,
): Promise<number> {
  const ctx = context(deps);
  const adapter = findAdapter(ctx, agent);
  const problem = isResult(adapter) ? adapter : hostRefusal(ctx, adapter);
  if (problem || isResult(adapter)) {
    reportError(problem ?? fail("Unknown agent."));
    return 1;
  }
  const [binary] = adapter.binaries;
  return new Promise<number>((resolve) => {
    const child = spawn(binary, args, { env: ctx.cliEnv, stdio: "inherit" });
    // Pass interruptions on to the CLI, and exit like a shell when it is killed.
    const forwarded: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
    const forward = (signal: NodeJS.Signals) => child.kill(signal);
    for (const signal of forwarded) process.on(signal, forward);
    const done = (code: number) => {
      for (const signal of forwarded) process.off(signal, forward);
      resolve(code);
    };
    child.on("error", (error) => {
      reportError(fail(`Could not run ${binary}: ${error.message}`));
      done(1);
    });
    child.on("exit", (code, signal) =>
      done(code ?? (signal ? 128 + (constants.signals[signal] ?? 0) : 0)),
    );
  });
}

const REPO_SKILL = join(".agents", "skills", "agent-bridge", "SKILL.md");

function gitRoot(start: string): string | undefined {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

/** `bridge skill --print` or `--repo` (FR-6a). */
export function skill(deps: Deps, mode: { print?: boolean; repo?: boolean }): CommandResult {
  if (mode.print) return { ok: true, message: readSkill().trimEnd() };
  if (!mode.repo) return fail("Choose `bridge skill --print` or `bridge skill --repo`.");
  const cwd = deps.cwd ?? process.cwd();
  const root = gitRoot(cwd);
  if (!root) return fail(`${cwd} is not inside a Git repository.`);
  const target = join(root, REPO_SKILL);
  if (existsSync(target) && !isAgentBridgeSkill(readFileSync(target, "utf8"))) {
    return fail(
      `${relative(cwd, target)} exists and was not written by Agent-Bridge; left unchanged.`,
    );
  }
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  writeFileSync(temporary, readSkill());
  renameSync(temporary, target);
  return {
    ok: true,
    message: `Wrote ${REPO_SKILL} in ${root}. Ask the user to review and commit it; Codex loads it when a new task starts.`,
    data: { path: target },
  };
}
