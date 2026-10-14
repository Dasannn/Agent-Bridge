import { spawn } from "node:child_process";
import type { Adapter, LoginProvider, Registry } from "../core/adapter.js";
import { detectHost } from "../core/host.js";
import { type CommandResult, mask } from "../core/output.js";
import { type BridgeHome, managedEnv, resolveHome } from "../core/paths.js";
import { completeLogin, loginInProgress, startLogin } from "../core/session.js";

export interface Deps {
  env: NodeJS.ProcessEnv;
  registry: Registry;
  /** Overrides for tests; default to the built-in runner and adapters. */
  runnerPath?: string;
  adapterModule?: string;
}

interface Context {
  deps: Deps;
  home: BridgeHome;
  cliEnv: NodeJS.ProcessEnv;
}

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
  if (await loginInProgress(adapter.id, provider.id, ctx.home)) return "login in progress";
  return (await provider.isAuthenticated(ctx.cliEnv)) ? "authenticated" : "not authenticated";
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
): Promise<CommandResult> {
  const ctx = context(deps);
  const adapter = findAdapter(ctx, agent);
  if (isResult(adapter)) return adapter;
  const refusal = hostRefusal(ctx, adapter);
  if (refusal) return refusal;
  if (!(await adapter.isInstalled(ctx.cliEnv))) {
    return fail(
      `${adapter.displayName} is not installed. Run \`bridge setup --agents ${adapter.id}\`.`,
    );
  }
  const provider = findProvider(ctx, adapter, providerId);
  if (isResult(provider)) return provider;
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
  });
  if (!result.ok) {
    const screen = result.screen ? `\n\nLast output from the CLI:\n${mask(result.screen)}` : "";
    return fail(`Could not start the ${adapter.displayName} login: ${result.error}${screen}`);
  }

  const flag = providerFlag(adapter, provider);
  const { url, code } = result.prompt;
  const userMessage =
    provider.strategy === "device-code"
      ? `Open this URL in your browser, sign in, and enter the code ${code ?? "shown there"}:\n${url}\n\nTell me when you have finished.`
      : `Open this URL in your browser, sign in, and paste the code you are shown back here:\n${url}`;
  const next =
    provider.strategy === "device-code"
      ? `bridge complete ${adapter.id}${flag}`
      : `bridge complete ${adapter.id}${flag} "<code>"`;
  return {
    ok: true,
    message: `Relay this message to the user exactly:\n\n${userMessage}\n\nThen run: ${next}`,
    data: { agent: adapter.id, provider: provider.id, url, code, next },
  };
}

export async function complete(
  deps: Deps,
  agent?: string,
  providerId?: string,
  response?: string,
): Promise<CommandResult> {
  const ctx = context(deps);
  const adapter = findAdapter(ctx, agent);
  if (isResult(adapter)) return adapter;
  const provider = findProvider(ctx, adapter, providerId);
  if (isResult(provider)) return provider;
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
  await provider.logout(ctx.cliEnv);
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
    child.on("error", (error) => {
      reportError(fail(`Could not run ${binary}: ${error.message}`));
      resolve(1);
    });
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}
