// OpenCode (decision 0002). Usable without login through its free models;
// subscription providers log in by link or with device codes.
import type { Adapter, LoginPrompt, LoginProvider } from "../core/adapter.js";
import { findBinary, npmInstall, runCommand, stripAnsi } from "./util.js";

// The ChatGPT sign-in link, complete once the line below it is drawn.
const LINK_PATTERN =
  /Go to:\s*(https:\/\/auth\.openai\.com\/oauth\/authorize\?\S+)\s*\n[\s\S]*Complete authorization/;

function parseLinkPrompt(screen: string): LoginPrompt | undefined {
  const match = screen.match(LINK_PATTERN);
  return match ? { url: match[1] } : undefined;
}

function parseDevicePrompt(screen: string): LoginPrompt | undefined {
  const url = screen.match(/Go to:\s*(https:\/\/\S+)/);
  const code = screen.match(/Enter code:\s*([A-Z0-9]{4}-[A-Z0-9]{4,6})[ \t]*\n/);
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

const LOGIN = ["opencode", "providers", "login"];

function provider(
  id: string,
  displayName: string,
  method: Pick<LoginProvider, "keys" | "strategy" | "parsePrompt" | "device">,
): LoginProvider {
  return {
    id,
    command: LOGIN,
    ...method,
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
    provider("openai", "OpenAI", {
      keys: [
        { after: "Search:", send: "OpenAI" },
        { after: "(1 match)", send: "\r" },
        { after: "● ChatGPT Pro/Plus (browser)", send: "\r" },
      ],
      strategy: "loopback-callback",
      parsePrompt: parseLinkPrompt,
      device: {
        command: LOGIN,
        keys: [
          { after: "Search:", send: "OpenAI" },
          { after: "(1 match)", send: "\r" },
          { after: "Login method", send: "\u001b[B" },
          { after: "● ChatGPT Pro/Plus (headless)", send: "\r" },
        ],
        strategy: "device-code",
        parsePrompt: parseDevicePrompt,
      },
    }),
    provider("github-copilot", "GitHub Copilot", {
      keys: [
        { after: "Search:", send: "Copilot" },
        { after: "(1 match)", send: "\r" },
        { after: "deployment type", send: "\r" },
      ],
      strategy: "device-code",
      parsePrompt: parseDevicePrompt,
    }),
  ],
};
