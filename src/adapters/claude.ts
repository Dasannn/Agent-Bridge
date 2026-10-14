// Claude Code CLI, for Claude subscriptions (decision 0006). Only offered when
// the host agent is not Claude Code.
import type { Adapter, LoginPrompt } from "../core/adapter.js";
import { findBinary, npmInstall, runCommand } from "./util.js";

function parsePrompt(screen: string): LoginPrompt | undefined {
  if (!/Paste code here/i.test(screen)) return undefined;
  const match = screen.match(/visit:\s*(https:\/\/\S+)/);
  return match ? { url: match[1] } : undefined;
}

async function isAuthenticated(env: NodeJS.ProcessEnv): Promise<boolean> {
  const binary = findBinary("claude", env);
  if (!binary) return false;
  const result = await runCommand(binary, ["auth", "status", "--json"], env, 60_000);
  try {
    return (JSON.parse(result.stdout) as { loggedIn?: boolean }).loggedIn === true;
  } catch {
    return false;
  }
}

export const claude: Adapter = {
  id: "claude",
  displayName: "Claude Code",
  binaries: ["claude"],
  requiresLogin: true,
  isInstalled: async (env) => findBinary("claude", env) !== undefined,
  install: (env) => npmInstall("@anthropic-ai/claude-code", env),
  delegationExample: 'bridge run claude -- -p "<task>" --output-format json',
  providers: [
    {
      id: "default",
      command: ["claude", "auth", "login"],
      strategy: "paste-code",
      parsePrompt,
      isAuthenticated,
      logout: async (env) => {
        const binary = findBinary("claude", env);
        if (binary) await runCommand(binary, ["auth", "logout"], env, 60_000);
      },
    },
  ],
};
