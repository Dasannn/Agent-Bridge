// Test adapters backed by test/fake-cli/fake-cli.mjs. Plain JavaScript so the
// session runner (a separate Node.js process) can import it.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../fake-cli/fake-cli.mjs", import.meta.url));
const node = process.execPath;

const isAuthenticated = async (env) => spawnSync(node, [cli, "status"], { env }).status === 0;
const logout = async (env) => {
  spawnSync(node, [cli, "logout"], { env });
};

const pastePrompt = (screen) => {
  const match = screen.match(/Open (\S+)/);
  return match && screen.includes("Paste code:") ? { url: match[1] } : undefined;
};
const devicePrompt = (screen) => {
  const url = screen.match(/Go to (\S+)/);
  const code = screen.match(/Enter code: (\S+)/);
  return url && code ? { url: url[1], code: code[1] } : undefined;
};

const linkPrompt = (screen) => {
  const match = screen.match(/Open (https:\/\/example\.test\/auth\?\S+)/);
  return match && screen.includes("Waiting for the browser") ? { url: match[1] } : undefined;
};

const provider = (id, mode, strategy, parsePrompt, prefix = []) => ({
  id,
  command: [...prefix, node, cli, mode],
  strategy,
  parsePrompt,
  isAuthenticated,
  logout,
});

export const adapters = [
  {
    id: "fake",
    displayName: "Fake CLI",
    binaries: ["fake"],
    requiresLogin: true,
    isInstalled: async () => true,
    install: async () => {},
    delegationExample: "fake run",
    models: { list: "fake models", model: "--model", effort: "--effort" },
    providers: [
      provider("paste", "paste-code", "paste-code", pastePrompt),
      provider("device", "device-code", "device-code", devicePrompt),
      provider("silent", "silent", "paste-code", pastePrompt),
      provider("stubborn", "stubborn", "paste-code", pastePrompt),
      provider("stays-open", "paste-code", "paste-code", pastePrompt, [
        "/usr/bin/env",
        "FAKE_STAY_OPEN=1",
      ]),
      {
        ...provider("menu", "menu", "device-code", devicePrompt),
        keys: [{ after: "Pick 1 or 2:", send: "2\r" }],
      },
      provider("slow", "device-code", "device-code", devicePrompt, [
        "/usr/bin/env",
        "FAKE_DEVICE_MS=5000",
      ]),
      {
        ...provider("paste-url", "paste-code", "paste-code", pastePrompt),
        normalizeResponse: (input) => {
          if (!input.includes("://")) return input;
          try {
            return new URL(input).searchParams.get("code") ?? undefined;
          } catch {
            return undefined;
          }
        },
      },
      {
        ...provider("link", "loopback", "loopback-callback", linkPrompt),
        device: {
          command: [node, cli, "device-code"],
          strategy: "device-code",
          parsePrompt: devicePrompt,
        },
      },
      provider("denied", "device-code", "device-code", devicePrompt, [
        "/usr/bin/env",
        "FAKE_FAIL=1",
      ]),
    ],
  },
];
