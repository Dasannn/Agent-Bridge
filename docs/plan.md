# Agent-Bridge v1 Plan

This plan sequences the work needed to deliver `docs/spec.md` with the
structure in `ARCHITECTURE.md`. Detailed, executable tasks live in
`docs/tasks.md`.

## Strategy

Several decisions depend on facts about the target CLIs that are not yet
verified (see the Open Questions in `docs/spec.md`). The plan therefore starts
with a spike that answers them, records each answer in `docs/decisions/`, and
only then commits to the parts of the design that depend on them.

Work that does not depend on the spike is still ordered after it, so that no
code is written against assumptions the spike may overturn.

`docs/tasks.md` is detailed for the next phase only. When a phase ends, the
tasks of the following phase are written or refined from what was learned, and
reviewed before execution.

## Phases

### Phase 0 — Spike: verify the target CLIs

Investigate OpenCode and Antigravity (`agy`) in a cloud container, without
writing product code.

Answers required:

1. Install command and binary name for each CLI.
2. Login command, login flow, and the exact output it prints in a headless
   container.
3. Whether the flow can be completed by relaying a URL and a pasted response
   (including the loopback-callback technique), verified with a real login.
4. How to detect that each CLI is authenticated, without printing secrets.
5. The non-interactive invocation of each CLI for delegation, and whether it
   reads `AGENTS.md`.
6. A pseudo-terminal approach for Node.js that works in the container,
   preferably without native compilation.
7. Where Claude Code and Codex load user skills from, whether one `SKILL.md`
   serves both, and whether a skill installed by an environment setup script
   is visible to the session.
8. Whether the npm package name `agent-bridge` is available.

Output: one decision record per topic in `docs/decisions/`, plus recorded CLI
output saved as test fixtures once the project is scaffolded.

Exit criteria: every question has a recorded answer, or a recorded blocker
reviewed with the project owner. If a CLI cannot be supported as specified,
the spec is revised before Phase 1.

Requires the project owner to complete real logins during the spike.

### Phase 1 — Project scaffold

Create the TypeScript package, tooling, and CI defined in `ARCHITECTURE.md`:
`package.json` with the `agent-bridge` and `bridge` binaries, strict
TypeScript, Biome, Vitest, and a GitHub Actions workflow running lint,
typecheck, and tests.

Exit criteria: `bridge --help` runs from a local build, and CI is green on an
empty test suite plus one smoke test.

### Phase 2 — Core

Build the CLI-independent core against the fake CLI:

- output rendering, `--json`, and secret masking;
- state paths and `AGENT_BRIDGE_HOME`;
- adapter interface and registry;
- the login strategies selected by the spike, with input validation;
- the session runner, its socket protocol, timeouts, and cancellation;
- the `status`, `login`, and `complete` commands.

Exit criteria: integration tests drive `login` and `complete` against the fake
CLI for every selected strategy and every error case in `docs/spec.md`.

### Phase 3 — Adapters

Implement the OpenCode and Antigravity adapters using the spike's decisions
and fixtures.

Exit criteria: adapter tests pass against recorded fixtures, and a manual
login of each CLI succeeds in a cloud session.

### Phase 4 — Skill and setup

Write `skill/SKILL.md`, generate its delegation examples from the adapters at
build time, and implement `bridge setup` to install the CLIs and the skill.

Exit criteria: in a fresh cloud session whose setup script runs
`npx -y github:dasannn/agent-bridge setup --agents opencode,agy`, the skill is
loaded and the primary agent can authenticate and delegate to both CLIs on
request, following a project's SDD workflow when one exists.

### Phase 5 — Release

Write the README (installation, setup script line, usage, security notes, and
a reminder to review each provider's terms), run the manual end-to-end
checklist, and publish to npm.

Exit criteria: all acceptance criteria in `docs/spec.md` are met and the
package is installable with `npx -y agent-bridge setup`.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A CLI's login cannot be relayed from a container | That CLI cannot be supported | Found in Phase 0, before any product code |
| Provider terms forbid this use | The CLI should not be supported | Checked in Phase 0; README states the user's responsibility |
| No pseudo-terminal works without native compilation | Slower, more fragile installs | Accept a native dependency only if the spike shows no alternative |
| CLIs change their login output | Adapters break silently | Fixture tests, and clear raw-output errors when parsing fails |
| The setup script runs after the agent loads skills | The skill is not available in that session | Verified in Phase 0; fall back to a documented manual step |
