# Docs snippet tests

Typed tests that run the JavaScript snippets of the chat docs
(`getstream.io/content/docs/chat/_default`, `chat/javascript` and `chat/node`) against a real Stream app.

```sh
cp test/docs-snippets/.env.example test/docs-snippets/.env   # fill in STREAM_API_KEY / STREAM_API_SECRET
yarn test-docs                                                # all docs tests
yarn test-docs server/04-messages/01-send_message.test.ts     # one file
yarn types-docs                                               # typecheck the docs tests
yarn test-docs-sync                                           # test regions == docs fences (no network)
yarn test-docs-sweep                                          # remove docs-test leftovers older than 30 min (DOCS_SWEEP_DRY_RUN=1 to list only, DOCS_SWEEP_MIN_AGE=0 for all)
yarn eslint test/docs-snippets && npx prettier --check test/docs-snippets   # lint (same rules as src/)
```

These tests hit the network and are not part of `yarn test`.

## Layout

```
client/<docs section>/<docs page>.test.ts   # client-side: user connected with a user token (tab label "JavaScript")
server/<docs section>/<docs page>.test.ts   # server-side: client with API secret (tab label "Node.js")
helpers/                                    # clients, unique ids, cleanup registry
```

The path mirrors the docs path, e.g. `_default/04-messages/01-send_message.md` maps to
`client/04-messages/01-send_message.test.ts` and `server/04-messages/01-send_message.test.ts`.
Pages under `chat/javascript/` go under `client/javascript/...` and pages under `chat/node/` under `server/node/...`.

## Conventions

- Import the SDK from `../../../src` (relative depth varies) and test helpers from `helpers/`. Use `import type` for types.
- `stream-chat` is aliased to `src/index.ts` (`resolve.alias` in `vitest.config.ts`, `paths` in `tsconfig.json`), so a docs fence that starts with `import ... from "stream-chat"` can be a region at module level: declare the values it uses (e.g. `apiKey`) above it. Both import paths load the same module, so `StreamChat.getInstance` returns the same singleton.
- Custom data the docs use (e.g. channel `name`) is declared once in `custom-types.d.ts` by augmenting the `Custom*Data` interfaces of `stream-chat`, the way the docs tell apps to. Add fields there rather than casting in tests.
- **Isolation**: the id or name of everything a test creates comes from `uniqueId('name')`: users, channels, channel types, roles, commands, blocklists, segments, campaigns (name), user groups, moderation config keys, predefined filters, push providers. Polls are matched by their creator, so create them as a `uniqueId` user. Never use fixed ids like `"john"` or `"general"`.
- **Cleanup**: register everything you create on a `Cleanup` instance and call `cleanup.run()` in `afterAll`. App-level settings changed by a test must be restored with `cleanup.add(...)`.
- Tests in one file may share data created in `beforeAll`. Nothing may leak across files.
- `cleanup.run()` attempts every step and then throws if anything failed, so leftovers show up as a failed `afterAll` instead of piling up in the app. Server-side hard channel deletion is a background task: `Cleanup` waits for it (`waitForTask`) and retries deleting channel types until their channels are gone.
- **Leak check** (`setup.ts`, runs automatically after each file's own `afterAll`): looks up everything minted by `uniqueId` in that file (users, channels, channel types, commands, roles, custom permissions, blocklists, segments, campaigns, user groups, moderation configs, predefined filters, push providers, polls). Anything still there fails the file with a `LEAK` error listing it, and is then removed. Per-user data (reminders, devices, drafts, ...) goes away with the user. It also snapshots app settings, pre-existing channel types and retention policies before the file and fails with `DRIFT` if anything changed and wasn't restored.
- Anything created under a non-`uniqueId` name can't be found by the leak check or the sweep. Don't do that.
- **Eventual consistency**: channel type changes (`createChannelType` / `updateChannelType`) take ~30s to reach every API node. A `create()` can succeed and the next call still fail with `<type>: channel type does not exist`. Call `await waitForChannelTypePropagation()` (from `helpers/wait.ts`) right after creating or updating a channel type. Timeouts are 90s per test and 180s per hook to leave room for this. Use `retry(fn, { retryIf })` for other eventually-consistent reads (e.g. search).
- **App settings**: pages are run one at a time, so tests may change app settings and built-in channel types, but must restore them (`cleanup.add`). The check after each file fails with `DRIFT` otherwise.
- **Push**: put `FIREBASE_CONFIG='{...service account JSON...}'` in `.env` to run push tests. Wrap push tests in `describePush` (`helpers/push.ts`), which skips them when the variable is missing. Push is not verified end-to-end; the credentials only exist because the API validates them.
- **Guest users** get their id rewritten to `guest-<uuid>-<requested id>`: register `client.userID` for cleanup.
- One `it` per docs snippet (or per closely related group of snippets in the same tab group).
- Client-side tests: `getClientSideClient(user)` returns a connected client. Disconnect it with `disconnectClients` in `afterAll`. Use `getServerClient()` only for setup/cleanup that a client can't do.
- Server-side tests: `getServerClient()` is the `serverClient` from the docs. Server calls need `user_id` / `created_by_id` where a client call would infer the user.
- Add basic `expect`s after each snippet to prove it did what the docs claim.

## Snippet markers and docs sync

Each docs fence has exactly one marked region in a test. `yarn test-docs-sync` (no network) compares them, so later edits on either side fail until they agree again:

```ts
// #region snippet docs="_default/04-messages/01-send_message.md" heading="Sending a Message" tab="Node.js" index=1
// COPY: channelId="general", userId="john"
const message = await serverClient
  .channel('messaging', channelId)
  .sendMessage({ text: 'Hello, world!', user_id: userId });
// #endregion snippet

// #docs-ignore docs="_default/07-push/07-legacy_push_system.md" heading="..." tab="JavaScript" index=1 reason="JSON template, not code"
```

- **Fence key**:
  - `docs` is the page path relative to `getstream.io/content/docs/chat/`.
  - `heading` is the text of the nearest heading above the fence.
  - `tab` is the fence `label` (or `unlabelled`).
  - `index` is 1-based among fences with the same heading text and tab (default 1).
- **COPY**: `name="literal"` pairs, applied to the region before comparing (identifier `name` becomes the docs literal). Don't use COPY variables as object keys or shorthand properties.
- **Comparison**: both sides are formatted with the same prettier options, so quote style and line wrapping don't matter, but any code or comment change does.
- **Coverage**: every JS fence (`js`/`javascript`/`ts`) of a page that has at least one marker must have a region or a `#docs-ignore`.
- **`DOCS_SYNC_WRITE=<page path> yarn test-docs-sync`** writes the regions of that page into the docs fences (docs prettier style). Use it to fill a new, empty `js label="Node.js"` fence or to apply a fix. `DOCS_SYNC_WRITE=1` writes all pages.
- **`DOCS_CHAT_DIR`** points at another docs checkout (default: `../getstream.io/content/docs/chat` next to this repo). The check is skipped if the directory doesn't exist.
- Use the same variable names as the docs (`client`, `serverClient`, `channel`, ...).
