// Codex CLI, for ChatGPT subscriptions (decision 0005).
import type { Adapter, LoginPrompt } from "../core/adapter.js";
import { findBinary, npmInstall, runCommand } from "./util.js";

function parsePrompt(screen: string): LoginPrompt | undefined {
  const url = screen.match(/https:\/\/auth\.openai\.com\/codex\/device\b/);
  const code = screen.match(/one-time code[^\n]*\n\s*([A-Z0-9]{4}-[A-Z0-9]{4,6})[ \t]*\n/);
  return url && code ? { url: url[0], code: code[1] } : undefined;
}

async function codexCommand(args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const binary = findBinary("codex", env);
  if (!binary) return 127;
  return (await runCommand(binary, args, env, 60_000)).code;
}

export const codex: Adapter = {
  id: "codex",
  displayName: "Codex",
  binaries: ["codex"],
  requiresLogin: true,
  isInstalled: async (env) => findBinary("codex", env) !== undefined,
  install: (env) => npmInstall("@openai/codex", env),
  delegationExample: 'bridge run codex -- exec "<task>" --json --skip-git-repo-check',
  providers: [
    {
      id: "default",
      command: ["codex", "login", "--device-auth"],
      strategy: "device-code",
      parsePrompt,
      isAuthenticated: async (env) => (await codexCommand(["login", "status"], env)) === 0,
      logout: async (env) => {
        await codexCommand(["logout"], env);
      },
    },
  ],
};
