# Agent-Bridge Tasks

Executable tasks for the current phase of `docs/plan.md`. Tasks for later
phases are added when the previous phase ends, and reviewed before execution.

Requirements for every task:

- Follow `docs/constitution.md`, `docs/spec.md`, and `ARCHITECTURE.md`.
- Write all repository content in English.
- Keep scratch work in `.agent/`, which is never committed.
- Never commit or paste secrets. Mask codes, tokens, and `code`/`state` URL
  parameters in any saved output.

## Phase 0 — Spike: complete

All Phase 0 questions are answered in `docs/decisions/0001` to `0008`, and
the spec, architecture, and plan were updated at the Phase 0 review.
Remaining verifications are listed at the end of `docs/spec.md`.

## Phase 1 — Project scaffold

Goal: a buildable, linted, tested TypeScript package whose `bridge` command
prints help and version, with CI running on every push and pull request.

Global constraints for this phase:

- Package name `cloud-agent-bridge`; commands `agent-bridge` and `bridge`.
- Node.js 20 or later; TypeScript strict mode; ES modules.
- Dev dependencies only: `typescript`, `@types/node`, `vitest`,
  `@biomejs/biome`. No runtime dependencies yet.
- Exact versions in `package.json` (no `^` or `~`), with `package-lock.json`
  committed.

### Task 1.1: Package, tooling, and `bridge --help`

**Files:**

- Create: `package.json`, `package-lock.json`, `tsconfig.json`,
  `biome.json`, `vitest.config.ts`
- Create: `src/cli/main.ts`, `src/cli/bin.ts`
- Test: `test/cli/main.test.ts`
- Modify: `.gitignore` (add `node_modules/`, `dist/`, `coverage/`)

**Interfaces:**

- Produces:
  `main(argv: string[], io?: { stdout(text: string): void; stderr(text: string): void }): Promise<number>`
  in `src/cli/main.ts`, returning the process exit code. Later phases add
  commands to it. `src/cli/bin.ts` calls
  `main(process.argv.slice(2))` and sets `process.exitCode`.

- [ ] **Step 1: Create the package and tooling.**
      `package.json`: `"type": "module"`, `"engines": { "node": ">=20" }`,
      `"bin": { "agent-bridge": "dist/cli/bin.js", "bridge": "dist/cli/bin.js" }`,
      `"files": ["dist", "skill"]`, and scripts `build` (`tsc -p .`),
      `typecheck` (`tsc -p . --noEmit`), `lint` (`biome check .`), `test`
      (`vitest run`). `tsconfig.json`: `strict`, `module` and
      `moduleResolution` `NodeNext`, `target` `ES2022`, `outDir` `dist`,
      `rootDir` `src`.
- [ ] **Step 2: Write the failing tests** in `test/cli/main.test.ts`:
  - `prints help for --help`: `main(["--help"], io)` resolves `0`; stdout
    contains `Usage: bridge <command>` and lists `setup`, `status`, `login`,
    `complete`, `logout`, `run`, and `skill`.
  - `prints help with no arguments`: same as above for `main([], io)`.
  - `prints the package version for --version`: resolves `0`; stdout is the
    `version` from `package.json` followed by a newline.
  - `rejects unknown commands`: `main(["nope"], io)` resolves `1`; stderr
    contains `Unknown command: nope` and `bridge --help`.
- [ ] **Step 3: Run** `npm test`. Expected: the four tests fail because
      `main` does not exist.
- [ ] **Step 4: Implement** `main` and `bin.ts`. Help text lists the seven
      commands with one-line descriptions taken from `docs/spec.md`. Commands
      other than help and version are not implemented in this phase and are
      not dispatched yet. Read the version from `package.json` at runtime.
- [ ] **Step 5: Run** `npm test`, `npm run typecheck`, and `npm run lint`.
      Expected: all pass.
- [ ] **Step 6: Run** `npm run build && node dist/cli/bin.js --help`.
      Expected: the help text, exit code `0`.
- [ ] **Step 7: Commit.**

### Task 1.2: Continuous integration

**Files:**

- Create: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: the `lint`, `typecheck`, `test`, and `build` scripts from
  Task 1.1.

- [ ] **Step 1:** Create a workflow that runs on `push` and `pull_request`,
      on `ubuntu-latest` with Node.js 20 and 22, and runs `npm ci`,
      `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] **Step 2:** Run the same commands locally in that order. Expected: all
      pass.
- [ ] **Step 3:** Commit and push. Expected: the workflow runs green on the
      branch.

### Task 1.3: Phase 1 review

- [ ] Confirm the Phase 1 exit criteria in `docs/plan.md`.
- [ ] Write the Phase 2 tasks and present them to the project owner for
      approval.
