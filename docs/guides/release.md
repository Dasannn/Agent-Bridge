# Release Checklist

How to publish a version of `cloud-agent-bridge` to npm.

## Before releasing

- [ ] CI is green on the commit to release (Node.js 20 and 22).
- [ ] `docs/tasks.md` has no open task for this version.
- [ ] `version` in `package.json` is the new version; the package test
      checks it.
- [ ] `npm pack --pack-destination /tmp` builds a tarball, and installing it
      in a temporary prefix gives a working `bridge --version`,
      `bridge skill --print`, and `bridge setup` (see Task 5.1).
- [ ] The work is merged to `main`.

## One-time npm setup (owner)

1. Create an account on [npmjs.com](https://www.npmjs.com) and turn on
   two-factor authentication.
2. Create a **granular access token**: Account → Access Tokens → Generate
   New Token → Granular Access Token. Give it read and write permission on
   packages; before the first release, use "All packages", because
   `cloud-agent-bridge` does not exist yet. Set an expiry date.
3. In the GitHub repository, add it as a secret: Settings → Secrets and
   variables → Actions → New repository secret, named `NPM_TOKEN`.

After the first release you can narrow the token to `cloud-agent-bridge`.
You can also replace it with npm's trusted publishing for GitHub Actions.

## Publishing

Push a tag named after the version, on the `main` commit:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The **Publish** workflow (`.github/workflows/publish.yml`) then:

1. runs the checks;
2. confirms the tag matches `package.json`;
3. publishes the package.

You can also create the tag from GitHub: Releases → Draft a new release →
choose a tag `v0.1.0` on `main`. The release notes are the changelog.

Without the workflow, from a machine with Node.js 20 or later, run from a
clean clone of `main`:

```bash
npm login
npm ci
npm test
npm publish --access public
```

## After publishing

Follow only the README, in fresh environments:

- [ ] Claude Code on the web:
  - a new session whose setup script is the README's;
  - check that the skill and `/bridge-code` load and that no permission
    prompt appears;
  - log in to one CLI and delegate one task.
- [ ] Codex Cloud:
  - a new task with the README's prompt;
  - log in to one CLI and delegate one task.
- [ ] Codex Cloud repository skill:
  - commit the file from `bridge skill --repo` to a test repository's
    default branch;
  - start a new task and confirm that the agent loads the skill without
    being told (spec remaining question 3).
- [ ] Record the results in a decision record for the release.
