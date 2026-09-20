# Publishing nlgrep

Package: [`nlgrep`](https://www.npmjs.com/package/nlgrep). The command remains `nlgrep`.

## Automatic releases

[Check and publish](../.github/workflows/publish.yml) runs on pull requests, pushes to `main` (including merges), and manual dispatches. It checks Node.js 22 and 24, builds a clean package, installs its tarball, and verifies the CLI without calling Jev.

Only `main` in `YehuiTang0316/jev-nlgrep` may publish. The workflow publishes the version committed in `package.json`; existing versions are skipped. An unpublished version older than npm's `latest` is rejected. Registry failures stop the release. The workflow does not edit version files or create release commits.

```sh
npm version patch --no-git-tag-version
npm run check
npm run smoke:package
```

Include both version files in the PR. Merge it into `main` to release. Use `minor` or `major` for larger changes. The CLI reads its installed package version, so `nlgrep --version` follows the published version.

## First publish and trusted publisher setup

The initial package must be created using an authenticated npm account. Subsequent workflow publishes use OIDC without an npm token in GitHub secrets.

```sh
npm login --registry=https://registry.npmjs.org
npm run check
npm run smoke:package
npm publish .release/nlgrep-0.1.0.tgz --access public
```

In [npm package settings](https://www.npmjs.com/package/nlgrep/access), add this GitHub Actions trusted publisher:

| Field | Value |
| --- | --- |
| Organization or user | `YehuiTang0316` |
| Repository | `jev-nlgrep` |
| Workflow filename | `publish.yml` |
| Environment | Leave empty |
| Allowed actions | Enable direct publishing with `npm publish` |

With npm 11.15+ and account 2FA, the equivalent CLI command is:

```sh
npm trust github nlgrep --repo YehuiTang0316/jev-nlgrep --file publish.yml --allow-publish --yes
```

The workflow uses npm 11.19.1, a GitHub-hosted runner, and `id-token: write`. npm automatically attaches provenance for trusted publishes from a public repository. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and the [npm trust command](https://docs.npmjs.com/cli/v11/commands/npm-trust/).

## Retry and package contents

Rerun a failed workflow after fixing the cause. If publishing completed before the failure, the existing-version check skips the duplicate. Bump the version only when creating a new release.

The tarball includes `bin/`, `dist/`, `package.json`, `README.md`, and `LICENSE`. `.env`, `.npmrc`, `.nlgrep/`, tests, evaluation fixtures, videos, and the Remotion project are excluded. README media and supporting-document links point to GitHub so they work on npm without enlarging the package.
