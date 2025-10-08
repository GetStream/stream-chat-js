Guidance for AI coding agents (Copilot, Cursor, Aider, Claude, etc.) working in this repository. Human readers are welcome, but this file is written for tools.

### Repository purpose

Official JavaScript SDK for Stream Chat. It targets browser, Node, and React Native with conditional exports and multiple bundles (ESM & CJS). The public API is used by a number of downstream SDKs and apps, so changes must be careful and semver-compliant. See README for usage and examples.

Agents should prioritize backwards compatibility, API stability, and high test coverage when changing code.

### Tech & toolchain

- Language: Typescript
- Primary runtime: Node (use the version in .nvmrc via nvm use)
- Testing: Unit/integration: Vitest.
- CI: Actions (assume PR validation on build + tests + lint)
- Lint/format: ESLint + Prettier (configs in repo root)
- Release discipline: Conventional Commits + automated release tooling (see commitlint/semantic-release configs).

### Project layout (high level)

- src/ — Classes and utilities (library source).
- scripts/ - Scripts run during the build process
- test/ — Repository tests.

Use the closest folder’s patterns and conventions when editing.

### Configurations

Root configs:

- .commitlintrc.json
- .gitignore
- .lintstagedrc.fix.json
- .lintstagedrc.json
- .nvmrc
- .prettierignore
- .prettierrc
- .releaserc.json
- eslint.config.mjs
- tsconfig.json
- vite.config.ts

Respect any repo-specific rules. Do not suppress rules broadly; justify and scope exceptions.

### Runbook (commands)

1. Install dependencies: yarn install
2. Build: yarn build
3. Typecheck: yarn types
4. Lint: yarn lint
5. Fix lint issues: yarn lint-fix
6. Unit tests: yarn test

### General rules

Conventions the agent must follow

#### Language & style

All source is TypeScript under src/. Keep strict types and update .d.ts surface when needed.
Run yarn lint-fix and ensure zero ESLint errors (flat config).

#### Releases

Do not bump versions manually. CI uses semantic-release and the commit history to determine the next version & changelog.

#### Linting & formatting

- Make sure the eslint and prettier configurations are followed. Run before committing:

```
yarn lint-fix
```

#### Commit / PR conventions

- Keep PRs small and focused; include tests.
- Follow the project’s “zero warnings” policy—fix new warnings and avoid introducing any.
- Use Conventional Commits (enforced via commitlint in CI). Examples: feat: …, fix: …, docs: …, refactor: …, chore: ….
- Ensure public API changes include docs.

#### Testing policy

Add/extend tests in the test/ folder.

Cover:

- Service functionality
- Utility tests
- Use fakes/mocks from the test helpers provided by the repo when possible.

#### Docs & samples

- When altering public API, update inline docs and any affected guide pages in the docs site where this repo is the source of truth.
- Keep sample/snippet code compilable.

#### Security & credentials

- Never commit API keys or customer data.
- Example code must use obvious placeholders (e.g., YOUR_STREAM_KEY).
- If you add scripts, ensure they fail closed on missing env vars.

#### When in doubt

- Mirror existing patterns in the nearest module.
- Prefer additive changes; avoid breaking public APIs.
- Ask maintainers (CODEOWNERS) through PR mentions for modules you touch.

---

Quick agent checklist (per commit)

- Build the src
- Run all tests and ensure green
- Run lint commands
- Update docs if public API changed
- Add/adjust tests
- No new warnings

End of machine guidance. Edit this file to refine agent behavior over time; keep human-facing details in README.md and docs.
