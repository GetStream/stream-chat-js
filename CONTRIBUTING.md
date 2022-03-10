# :recycle: Contributing

We welcome code changes that improve this library or fix a problem, please make sure to follow all best practices and add tests if applicable before submitting a Pull Request on Github. We are very happy to merge your code in the official repository. Make sure to sign our [Contributor License Agreement (CLA)](https://docs.google.com/forms/d/e/1FAIpQLScFKsKkAJI7mhCr7K9rEIOpqIDThrWxuvxnwUq2XkHyG154vQ/viewform) first. See our license file for more details.

## Getting started

### Install dependencies

```shell
$ yarn install --frozen-lockfile --ignore-engines
```

### Run tests

```shell
$ yarn test-types
$ yarn run test-unit
```

## Linting and code formatting

We use [ESLint](https://eslint.org/) for linting and [Prettier](https://prettier.io/) for code formatting. We enforce it during the build process. If your IDE has integration with these tools, it's recommended to set them up.

## Commit message convention

Since we're autogenerating our [CHANGELOG](./CHANGELOG.md), we need to follow a specific commit message convention.
You can read about conventional commits [here](https://www.conventionalcommits.org/). Here's how a usual commit message looks like for a new feature: `feat: allow provided config object to extend other configs`. A bugfix: `fix: prevent racing of requests`.

## Release (for Stream developers)

Releasing this package involves two GitHub Action steps:

- Kick off a job called `initiate_release` ([link](https://github.com/GetStream/stream-chat-js/actions/workflows/initiate_release.yml)).

The job creates a pull request with the changelog. Check if it looks good.

- Merge the pull request.

Once the PR is merged, it automatically kicks off another job which will create the tag and created a GitHub release.
