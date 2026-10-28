# :recycle: Contributing

We welcome code changes that improve this library or fix a problem, please make sure to follow all best practices and add tests if applicable before submitting a Pull Request on Github. We are very happy to merge your code in the official repository. Make sure to sign our [Contributor License Agreement (CLA)](https://docs.google.com/forms/d/e/1FAIpQLScFKsKkAJI7mhCr7K9rEIOpqIDThrWxuvxnwUq2XkHyG154vQ/viewform) first. See our license file for more details.

## Getting started

### Install dependencies

This repo uses Yarn 4 (Berry). The Yarn 4 binary is committed to `.yarn/releases/`; any globally installed Yarn launcher delegates to it via `yarnPath`. No Corepack setup needed.

```shell
$ yarn install --immutable
```

### Run tests

```shell
$ yarn run test-unit
```

## Linting and code formatting

We use [ESLint](https://eslint.org/) for linting and [Prettier](https://prettier.io/) for code formatting. We enforce it during the build process. If your IDE has integration with these tools, it's recommended to set them up.

## JSDoc

See [`JSDOC.md`](./JSDOC.md) for the canonical JSDoc format used in this repository. The format is enforced by `eslint-plugin-jsdoc`.

## Commit message convention

Since we're autogenerating our [CHANGELOG](./CHANGELOG.md), we need to follow a specific commit message convention.
You can read about conventional commits [here](https://www.conventionalcommits.org/). Here's how a usual commit message looks like for a new feature: `feat: allow provided config object to extend other configs`. A bugfix: `fix: prevent racing of requests`.

## Release (for Stream developers)

Releases are automated with [semantic-release](https://github.com/semantic-release/semantic-release), so never bump the version manually. The next version and the changelog are derived from the commit messages since the last release.

To release, run the `Release` workflow ([link](https://github.com/GetStream/stream-chat-js/actions/workflows/release.yml)) from the branch you want to publish:

- `master` publishes to the `latest` npm dist-tag.
- `release-v8` publishes `8.x` versions to the `v8` dist-tag.
- `rc` publishes prereleases.

The workflow updates `CHANGELOG.md`, publishes the package to npm, and creates the git tag and GitHub release. Enable the `dry_run` input to preview the next version and release notes without publishing anything.
