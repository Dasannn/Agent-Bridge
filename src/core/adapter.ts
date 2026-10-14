export type StrategyId = "paste-code" | "device-code";

export interface LoginPrompt {
  /** URL the user opens in their own browser. */
  url: string;
  /** Code the user types on the provider's page (device-code flows). */
  code?: string;
}

export interface LoginProvider {
  id: string;
  /** Login command, run in a pseudo-terminal with the managed environment. */
  command: string[];
  /** Keystrokes written in order once the CLI has drawn its first screen. */
  keys?: string[];
  strategy: StrategyId;
  /**
   * Turns what the user pasted into what the CLI expects, for example the
   * code from a full callback URL. Returns undefined when the input is not
   * acceptable. Without it, only a bare code is accepted.
   */
  normalizeResponse?(input: string): string | undefined;
  /** Extracts the prompt from the rendered screen text. */
  parsePrompt(screen: string): LoginPrompt | undefined;
  isAuthenticated(env: NodeJS.ProcessEnv): Promise<boolean>;
  logout(env: NodeJS.ProcessEnv): Promise<void>;
}

export interface Adapter {
  id: string;
  displayName: string;
  /** Commands the agent is allowed to run for this CLI. */
  binaries: string[];
  /** False when the CLI is usable without logging in (OpenCode free models). */
  requiresLogin: boolean;
  providers: LoginProvider[];
  isInstalled(env: NodeJS.ProcessEnv): Promise<boolean>;
  /** Installs the CLI into the Agent-Bridge prefix on the managed PATH. */
  install(env: NodeJS.ProcessEnv): Promise<void>;
  /** Non-interactive invocation shown in the skill. */
  delegationExample: string;
}

export interface Registry {
  get(id: string): Adapter | undefined;
  list(): Adapter[];
  provider(adapter: Adapter, id?: string): LoginProvider | undefined;
}

export function createRegistry(adapters: Adapter[]): Registry {
  return {
    get: (id) => adapters.find((adapter) => adapter.id === id),
    list: () => [...adapters],
    provider: (adapter, id) => {
      if (id === undefined) {
        return adapter.providers.length === 1 ? adapter.providers[0] : undefined;
      }
      return adapter.providers.find((provider) => provider.id === id);
    },
  };
}
