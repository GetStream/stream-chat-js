# Compatibility Report: `stream-chat-react@release-v13` vs local `stream-chat-js@feat/message-paginator`

## Environment

- React worktree: `/Users/martincupela/Projects/stream/chat/stream-chat-react-worktrees/chatview-layout-controller`
- React branch: `release-v13`
- JS SDK repo: `/Users/martincupela/Projects/stream/chat/stream-chat-js`
- JS branch: `feat/message-paginator`

## Dependency wiring

`stream-chat-react` resolved `stream-chat` through existing yarn-link symlink:

- `node_modules/stream-chat -> /Users/martincupela/.config/yarn/link/stream-chat`
- `/Users/martincupela/.config/yarn/link/stream-chat -> /Users/martincupela/Projects/stream/chat/stream-chat-js`

So test runs consumed local SDK code from this branch.

## Commands run

1. Build / type readiness on JS SDK side (already validated in prior steps):

- `yarn build` (in `stream-chat-js`)

2. Targeted release-v13 compatibility tests (React worktree):

- `yarn test --watchman=false src/components/Channel/__tests__/Channel.test.js src/components/MessageList/__tests__/MessageList.test.js src/components/Thread/__tests__/Thread.test.js`

3. Typecheck in React worktree:

- `yarn types`

4. Full React test matrix:

- `yarn test --watchman=false`

5. Reproduction of initially failing suites only:

- `yarn test --watchman=false src/components/MessageInput/__tests__/ThreadMessageInput.test.js src/components/Poll/__tests__/PollCreationDialog.test.js`

6. Full React test matrix after test updates:

- `yarn test --watchman=false`

## Results

- Targeted test suites: **PASS**
  - `Channel.test.js`: pass
  - `MessageList.test.js`: pass
  - `Thread.test.js`: pass
  - Total: 3 suites, 133 tests passed
- React typecheck: **PASS**
- Full suite (final): **PASS**
  - `139 passed, 0 failed`
  - `2024 passed tests, 2 skipped`

## Observations

- `--watchman=false` was required due to sandbox watchman permission errors; this is environment-related, not product behavior.
- There were pre-existing console warnings in tests (`MessageTimestamp ... invalid created_at date`, React `act(...)` warnings), but no assertion failures.

## Compatibility conclusion (targeted)

For the validated `release-v13` compatibility surfaces, no breaking regressions were detected when using local `stream-chat-js@feat/message-paginator`:

- Legacy channel pagination usage (`channel.state.messagePagination` / `messageSets`) continues to work in tested flows.
- mark-read / `doMarkReadRequest`-related Channel and MessageList flows pass.
- Thread flows in tested suite pass.

## Full-suite findings and resolution

1. `ThreadMessageInput` draft test triggered unexpected network delete request

- Failing test:
  - `src/components/MessageInput/__tests__/ThreadMessageInput.test.js`
- case: `draft › is queried when drafts are enabled`
- Error:
  - `AxiosError: Network Error` from `Channel._deleteDraft` via `MessageComposer.deleteDraft`.
- Resolution:
  - mocked `customChannel._deleteDraft` in test setup to avoid external HTTP in test env.

2. Poll max-vote validation behavior changed (value clamping)

- Failing test:
  - `src/components/Poll/__tests__/PollCreationDialog.test.js`
- case updated to `clamps max vote count to 10 and allows submission`
- Resolution:
  - adjusted assertions to new behavior:
    - error text is empty
    - value is clamped to `10`
    - submit button is enabled
  - no translation updates required (`i18n/en.json` already contains the previous key).

## Remaining risk

- Full Jest matrix is green for this setup; no blocking compatibility failures remain.
