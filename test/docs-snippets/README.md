# Docs snippet tests

Typed tests that run the client-side JavaScript snippets of the chat and platform docs (the pages of the
sidebars `getstream.io/content/docs/_sidebars/[chat][javascript].json` and `[platform][default].json`) against a
real Stream app. Only fences labelled `JavaScript` are in scope (docs fences must always have a label): they are fixed
when they are wrong or contain server-side code. `Node.js` fences (server-side, with or without `@stream-io/node-sdk`) are out of scope and are neither tested nor changed.
Platform pages also cover other products: their Feeds fences (`@stream-io/feeds-client` and its React / React Native
hooks) are excluded with `EXCLUDED_SECTIONS` (see below).

```sh
cp test/docs-snippets/.env.example test/docs-snippets/.env   # fill in STREAM_API_KEY / STREAM_API_SECRET (and STREAM_PUSH_PROVIDER_NAME)
yarn test-docs                                                # all docs tests
yarn test-docs pages/chat/04-messages/01-send_message.test.ts # one file
yarn types-docs                                               # typecheck the docs tests
yarn test-docs-sync                                           # test regions == docs fences (no network)
yarn test-docs-sweep                                          # remove docs-test leftovers older than 30 min (DOCS_SWEEP_DRY_RUN=1 to list only, DOCS_SWEEP_MIN_AGE=0 for all)
yarn eslint test/docs-snippets && npx prettier --check test/docs-snippets   # lint (same rules as src/)
```

These tests hit the network and are not part of `yarn test`.

## How to add tests?

Run the `docs-sync` Claude Code skill (`.claude/skills/docs-sync/SKILL.md`): `/docs-sync [path to the getstream.io checkout]`. It runs `yarn test-docs-sync` against that checkout, adds tests for new `JavaScript` snippets, updates existing tests to docs changes (the docs win), and writes fixes for snippets that don't work back to the docs.

## Layout

```
pages/chat/<docs section>/<docs page>.test.ts      # chat docs; user connected with a user token (tab label "JavaScript")
pages/platform/<docs section>/<docs page>.test.ts  # platform docs, same conventions
helpers/                                    # clients (stream-chat-js user clients, node-sdk server client), unique ids,
                                            # cleanup registry, server-side helpers, waits, leak check, app snapshot
setup.ts                                    # .env loading, per-file leak check and app-settings drift check
custom-types.d.ts                           # Custom*Data augmentations for the custom fields the docs use
sync/                                       # `yarn test-docs-sync` (docs fence <-> test region check)
maintenance/                                # `yarn test-docs-sweep`
docs-snippets-todo.md                       # pages to cover and their status, open generator and API issues
docs-snippets-agent-prompt.md               # prompt for an agent that covers one page
AGENTS.md                                   # test conventions and API quirks, read before working on a page
```

The path mirrors the docs path relative to `content/docs/`, without `_default/`:
`chat/_default/04-messages/01-send_message.md` maps to `pages/chat/04-messages/01-send_message.test.ts`,
`chat/javascript/...` to `pages/chat/javascript/...` and `platform/02-identity-and-access/04-multi-tenancy.md` to
`pages/platform/02-identity-and-access/04-multi-tenancy.test.ts`.

## Conventions

The test conventions and the API quirks found so far are in [`AGENTS.md`](AGENTS.md). Read it before working on a page.

## Snippet markers and docs sync

Each docs fence has exactly one marked region in a test. `yarn test-docs-sync` (no network) compares them, so later edits on either side fail until they agree again:

```ts
// #region snippet docs="chat/_default/04-messages/01-send_message.md" heading="Sending a Message" tab="JavaScript" index=1
// COPY: channelId="general"
const message = await client
  .channel('messaging', channelId)
  .sendMessage({ text: 'Hello, world!' });
// #endregion snippet
```

- **Fence key**:
  - `docs` is the page path relative to `getstream.io/content/docs/` (`chat/...` or `platform/...`).
  - `heading` is the text of the nearest heading above the fence.
  - `tab` is the fence `label` (or `unlabelled`).
  - `index` is 1-based among fences with the same heading text and tab (default 1).
- **COPY**: `name="literal"` pairs, applied to the region before comparing (identifier `name` becomes the docs literal). Don't use COPY variables as object keys or shorthand properties.
- **Comparison**: both sides are formatted with the same prettier options, so quote style and line wrapping don't matter, but any code or comment change does.
- **Coverage** (checked first): every JS fence (`js`/`javascript`/`ts`/`typescript`) on the pages of the tested sidebars (`SIDEBARS` in `sync/parse.ts`: `[chat][javascript].json`, `[platform][default].json`), whether or not the page has tests yet, must have a region (inside `it.skip` if it can't run). `Node.js` fences and comment-only fences (e.g. the "server-side only" placeholders) are ignored.
- **Labels**: every JS fence on those pages must be labelled `JavaScript` or `Node.js`; unlabelled or otherwise labelled JS fences fail.
- **Excluded pages**: `EXCLUDED_PAGES` in `sync/parse.ts` lists sidebar pages that are deliberately not validated, with a reason (e.g. the v9 upgrade guide's TSX type examples). Both checks skip them.
- **Excluded sections**: `EXCLUDED_SECTIONS` in `sync/parse.ts` lists headings per page, with a reason. Every fence nested under one of them (at any heading level) is skipped by both checks. Used for the Feeds fences on platform pages (e.g. `Feeds Push Preferences`, whose `JavaScript`, `React` and `React Native` tabs use `@stream-io/feeds-client`).
- **`DOCS_SYNC_WRITE=<page path, e.g. chat/_default/04-messages/01-send_message.md> yarn test-docs-sync`** writes the regions of that page into the docs fences (docs prettier style). Use it to apply a fix to the docs. `DOCS_SYNC_WRITE=1` writes all pages.
- **`DOCS_DIR`** points at another docs checkout (default: `../getstream.io/content/docs` next to this repo). The check is skipped if the directory doesn't exist.
- Use the same variable names as the docs (`client`, `channel`, ...).
