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
- [ ] `CHANGELOG.md` has an entry for the new version.
- [ ] The work is merged to `main`.

## One-time npm setup (owner)

Configure a trusted publisher once. On [npmjs.com](https://www.npmjs.com),
open `cloud-agent-bridge` → Settings → Trusted Publisher → GitHub Actions,
with these values:

- User: `Dasannn`.
- Repository: `Agent-Bridge`.
- Workflow filename: `publish.yml`.
- Environment: leave empty.

The trusted publisher allows `npm stage publish` only, so the workflow
stages releases for the owner's approval.

No token or repository secret is needed. The workflow uses Node.js 22
(22.14.0 or later) and npm 11.15.0 or later, with `id-token: write`.
`npm stage publish` detects OIDC automatically and generates provenance.
Do not set `registry-url` in `actions/setup-node`: its generated `.npmrc`
can make npm use a placeholder token instead of OIDC.

### Retiring the old token

After the first trusted release succeeds, delete the `NPM_TOKEN` repository
secret and delete the old token on npm. Optionally set Publishing access to
**Require two-factor authentication and disallow tokens**.

## Publishing

Push a tag named after the version, on the `main` commit:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The **Publish** workflow (`.github/workflows/publish.yml`) then:

1. runs the checks;
2. confirms the tag matches `package.json`;
3. stages the package for the owner's approval.

The owner approves from the terminal on their own computer, with npm
11.15.0 or later:

```bash
npm install -g npm@latest
npm login
npm stage list cloud-agent-bridge
npm stage approve <stage-id>
```

Approval asks for the 2FA code. The stage id is also printed at the end of
the **Publish** workflow log ("staged with id ..."). OIDC tokens cannot
approve a release. The version is not public until approved; staging
reserves its semver version. To reject the staged release, run
`npm stage reject <stage-id>`. npmjs.com may also offer approval in the
package's pages.

You can also create the tag from GitHub: Releases → Draft a new release →
choose a tag `v0.1.0` on `main`. The GitHub release notes can copy the new
version's entry from `CHANGELOG.md`.

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

## When the CLI canary fails

The **CLI canary** workflow runs weekly against the latest supported CLIs.
It checks that each login produces the expected provider URL and, for device
logins, a non-empty code. It never signs in and needs no secrets.

GitHub emails a failure to whoever last changed the workflow's schedule or
re-enabled it, if they turned on email for Actions in their
[notification settings](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications).
If the owner gets no email, disable and re-enable the workflow under
Actions → CLI canary.
In public repositories, scheduled workflows pause after 60 days without
repository activity. Re-enable under Actions → CLI canary → Enable workflow
([GitHub schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)).

Open the failing job and read the CLI output. Update the adapter's pattern
with a test for the new output, then release a patch version.
