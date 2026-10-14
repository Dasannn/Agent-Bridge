# Changelog

All notable changes to this project are documented here.
This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `SECURITY.md`, issue forms (including one for a CLI whose login changed),
  and a troubleshooting guide.

### Changed

- GitHub Actions upgraded to v5.

## [0.1.2] - 2026-10-14

### Changed

- No change to the package's behaviour since 0.1.0.
- First release published with npm trusted publishing, staged and approved
  by the owner with 2FA, with provenance (decision 0013).

### Added

- Weekly CLI canary workflow for the six supported login cases.

## [0.1.1] - Not published

Its tag predates the switch to staged publishing. See
[decision 0013](docs/decisions/0013-trusted-publishing.md).

## [0.1.0] - 2026-10-14

### Added

- First release of `cloud-agent-bridge`, with the `bridge` and `agent-bridge`
  commands.
- `setup` to install listed CLIs, the skill, and Claude Code permission rules.
- `status` to report installed CLIs, authentication, and pending logins.
- `login`, with `--provider` for multi-provider CLIs and `--device` where
  supported; `complete` to finish a login; `logout` to switch accounts.
- OpenCode with free models and optional ChatGPT login by link or device
  code, or GitHub Copilot login by device code.
- Antigravity with Google sign-in and a pasted code; Codex with ChatGPT
  sign-in by link or device code; Claude Code with Claude sign-in and a
  pasted code.
- `run` to invoke a CLI in the managed environment.
- `skill --print` to show the skill and `skill --repo` to add it to a
  repository on request.
- `/bridge-code` for Claude Code to finish a login with a code or address.
- Portable home for read-only home directories.
- Host-agent exclusion from login, logout, and delegation targets.
- Model and effort selection through the skill, kept for the conversation.
  Delegation happens only on explicit request and follows the project's
  workflow when one exists.

[Unreleased]: https://github.com/Dasannn/Agent-Bridge/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/Dasannn/Agent-Bridge/releases/tag/v0.1.2
[0.1.1]: https://github.com/Dasannn/Agent-Bridge/releases/tag/v0.1.1
[0.1.0]: https://github.com/Dasannn/Agent-Bridge/releases/tag/v0.1.0
