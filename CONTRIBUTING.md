# Contributing

Bug reports, focused pull requests, and synthetic search examples are welcome.

## Local setup

Requires Node.js 22+.

```sh
git clone https://github.com/YehuiTang0316/jev-nlgrep.git
cd jev-nlgrep
npm ci
npm run check
npm run smoke:package
```

`npm run check` runs type checks, offline tests, and a clean build. `npm run smoke:package` installs the actual tarball in a temporary directory and checks the CLI, version, JavaScript exports, and offline search planning. Neither command calls Jev.

## Pull requests

- Open a branch and keep the change focused. Explain the behavior and validation in the PR.
- Add tests for behavioral changes. Use synthetic fixtures and mocked evaluators.
- Keep `.env`, npm credentials, caches, and real private files out of commits and fixtures.
- Live Jev evaluations are opt-in and share the existing cumulative $5 budget. Never delete or reset `.nlgrep/eval-budget.json` to regain budget.
- For a release, run `npm version patch --no-git-tag-version` (or `minor` / `major`) and include both `package.json` and `package-lock.json` in the PR.

Merging a new version into `main` automatically runs checks and publishes it to npm. Merges without a version bump run checks and skip publishing the existing version. See [release setup](./docs/RELEASING.md).

## Videos

Remotion dependencies live in `comparison-videos/`. See its [README](./comparison-videos/README.md) for editing and rendering. Video work uses saved evaluation data and does not call Jev.

## License

Contributions are licensed under the project's [MIT License](./LICENSE).
