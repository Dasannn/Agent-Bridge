import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { adapters } from "../adapters/index.js";
import { createRegistry } from "../core/adapter.js";
import { type CommandResult, render } from "../core/output.js";
import * as commands from "./commands.js";

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
}

export type Main = typeof main;

const defaultIo: Io = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

const HELP = `Usage: bridge <command> [options]

Authenticate coding-agent CLIs in this session and run them for delegation.

Commands:
  setup      Install CLIs and the skill, and grant the agent permission to run them
  status     Show which CLIs are installed, authenticated, or the host agent
  login      Start a CLI's login and print what the user must open
  complete   Finish a login with the response the user pasted
  logout     Sign a CLI out, for example to switch accounts
  run        Run a CLI in the environment Agent-Bridge manages
  skill      Print the skill, or add it to the current repository

Usage:
  bridge status [agent] [--json]
  bridge login <agent> [--provider <id>] [--json]
  bridge complete <agent> [--provider <id>] ["<code>"] [--json]
  bridge logout <agent> [--provider <id>] [--json]
  bridge run <agent> -- <arguments for the CLI>

Options:
  -h, --help     Show this help
  -v, --version  Show the version
`;

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string;
  };
  return pkg.version;
}

const defaultDeps = (): commands.Deps => ({
  env: process.env,
  registry: createRegistry(adapters),
});

export async function main(
  argv: string[],
  io: Io = defaultIo,
  deps: commands.Deps = defaultDeps(),
): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    io.stdout(HELP);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    io.stdout(`${readVersion()}\n`);
    return 0;
  }

  const separator = rest.indexOf("--");
  const own = separator >= 0 ? rest.slice(0, separator) : rest;
  const passthrough = separator >= 0 ? rest.slice(separator + 1) : [];

  let parsed: ReturnType<typeof parseOptions>;
  try {
    parsed = parseOptions(own);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const { values, positionals } = parsed;
  const json = values.json === true;
  const emit = (result: CommandResult): number => {
    (result.ok ? io.stdout : io.stderr)(render(result, json));
    return result.ok ? 0 : 1;
  };
  const [agent, response] = positionals;

  switch (command) {
    case "status":
      return emit(await commands.status(deps, agent));
    case "login":
      return emit(await commands.login(deps, agent, values.provider));
    case "complete":
      return emit(await commands.complete(deps, agent, values.provider, response));
    case "logout":
      return emit(await commands.logout(deps, agent, values.provider));
    case "run":
      return commands.run(deps, agent, passthrough, emit);
    case "setup":
    case "skill":
      return emit({ ok: false, message: `bridge ${command}: not implemented yet.` });
    default:
      io.stderr(
        `Unknown command: ${command}\nRun \`bridge --help\` to see the available commands.\n`,
      );
      return 1;
  }
}

function parseOptions(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean" },
      provider: { type: "string" },
    },
  });
}
