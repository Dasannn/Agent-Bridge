// OpenCode (decision 0002). Usable without login through its free models;
// subscription providers log in with device codes.
import type { Adapter, LoginPrompt, LoginProvider } from "../core/adapter.js";
import { findBinary, npmInstall, runCommand, stripAnsi } from "./util.js";

function parsePrompt(screen: string): LoginPrompt | undefined {
  const url = screen.match(/Go to:\s*(https:\/\/\S+)/);
  const code = screen.match(/Enter code:\s*([A-Z0-9]{4}-[A-Z0-9]{4,6})\b/);
  return url && code ? { url: url[1], code: code[1] } : undefined;
}

/** Provider names listed under "Credentials" in `opencode providers list`. */
export function connectedProviders(listOutput: string): string[] {
  const text = stripAnsi(listOutput);
  const start = text.indexOf("Credentials");
  const end = text.indexOf("Environment", start);
  if (start < 0) return [];
  const section = text.slice(start, end < 0 ? undefined : end);
  const names: string[] = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^\s*•\s+(.+?)\s{1,}\S+\s*$/);
    if (match) names.push(match[1].trim());
  }
  return names;
}

async function opencodeCommand(args: string[], env: NodeJS.ProcessEnv) {
  const binary = findBinary("opencode", env);
  if (!binary) return { code: 127, stdout: "", stderr: "" };
  return runCommand(binary, args, env, 60_000);
}

function provider(id: string, displayName: string, keys: LoginProvider["keys"]): LoginProvider {
  return {
    id,
    command: ["opencode", "providers", "login"],
    keys,
    strategy: "device-code",
    parsePrompt,
    isAuthenticated: async (env) => {
      const result = await opencodeCommand(["providers", "list"], env);
      return connectedProviders(result.stdout).includes(displayName);
    },
    logout: async (env) => {
      await opencodeCommand(["providers", "logout", id], env);
    },
  };
}

export const opencode: Adapter = {
  id: "opencode",
  displayName: "OpenCode",
  binaries: ["opencode"],
  requiresLogin: false,
  isInstalled: async (env) => findBinary("opencode", env) !== undefined,
  install: (env) => npmInstall("opencode-ai", env),
  delegationExample: 'bridge run opencode -- run "<task>" --format json',
  providers: [
    provider("openai", "OpenAI", [
      { after: "Search:", send: "OpenAI" },
      { after: "(1 match)", send: "\r" },
      { after: "Login method", send: "\u001b[B" },
      { after: "● ChatGPT Pro/Plus (headless)", send: "\r" },
    ]),
    provider("github-copilot", "GitHub Copilot", [
      { after: "Search:", send: "Copilot" },
      { after: "(1 match)", send: "\r" },
      { after: "deployment type", send: "\r" },
    ]),
  ],
};
