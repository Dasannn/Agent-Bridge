# 0014: Codex Cloud Repository Skill

- Status: Accepted
- Date: 2026-10-14

## Context

Remaining question 1 in `docs/spec.md` asks whether a committed repository
skill loads at the start of a Codex Cloud task. Without it, Codex Cloud users
must paste the README's install prompt in every task.

## Evidence

The owner followed the post-release check in `docs/guides/release.md` in a
private test repository:

1. A Codex Cloud task installed `cloud-agent-bridge` 0.1.2 into `/tmp/ab`
   and ran `bridge skill --repo`, which wrote
   `.agents/skills/agent-bridge/SKILL.md`. The owner merged it into the
   repository's default branch.
2. A new task was asked: "What skills do you have available in this task?
   List them with their descriptions. Do not run any commands." It listed
   the `agent-bridge` skill.
3. Another new task was asked only: "Connect Antigravity." It installed
   Agent-Bridge by itself following the skill and returned the Antigravity
   login link.

## Result

A committed repository skill loads at the start of a Codex Cloud task.
The owner reported "everything works".

## Consequences

- The README's advice to run `bridge skill --repo` once and commit the
  skill is confirmed. New tasks can use it without the install prompt.
- Remaining question 1 in the spec is closed.
