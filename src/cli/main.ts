import { readFileSync } from "node:fs";

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
}

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

export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  const [command] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    io.stdout(HELP);
    return 0;
  }

  if (command === "--version" || command === "-v") {
    io.stdout(`${readVersion()}\n`);
    return 0;
  }

  io.stderr(`Unknown command: ${command}\nRun \`bridge --help\` to see the available commands.\n`);
  return 1;
}
