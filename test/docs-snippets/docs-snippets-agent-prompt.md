# Agent prompt: test the docs snippets of one page

Replace `{{PAGE}}` with a path from `/Users/zitaszupera/Stream/stream-chat-js/test/docs-snippets/docs-snippets-todo.md`, e.g. `chat/_default/04-messages/01-send_message.md`.

---

You are verifying the client-side JavaScript code snippets of one Stream Chat docs page by writing typed tests that run them against a real Stream app with a user token. Only fences labelled `JavaScript` are in scope. Docs fences must always have a label: if you find an unlabelled `js` fence, label it (`JavaScript` for client code, `Node.js` for `@stream-io/node-sdk` code) and report it. `Node.js` fences are out of scope: don't test, add or change them.

**Page:** `/Users/zitaszupera/Stream/getstream.io/content/docs/{{PAGE}}`

## Hard rules

- **Do not commit, push, stash, or create branches** in any repo. Work only in the local working tree.
- **Do not write to `/Users/zitaszupera/Stream/stream-chat-js/test/docs-snippets/learnings.md`.** Read it, and propose additions in your final report.
- Only touch:
  - the test files for this page under `/Users/zitaszupera/Stream/stream-chat-js/test/docs-snippets/`
  - the docs page itself
  - this page's status row in `/Users/zitaszupera/Stream/stream-chat-js/test/docs-snippets/docs-snippets-todo.md`
  - `/Users/zitaszupera/Stream/stream-chat-js/test/docs-snippets/custom-types.d.ts`, to add custom data fields the snippets use (augment the matching `Custom*Data` interface; never remove or change existing fields)
  - type definitions in `stream-chat-js/src/` (types only, see below)
- Do not edit the helpers, the configs, or other pages. If a helper is missing something, write a local helper in your test file and propose the shared helper in your report.
- **`src/` may only be edited to fix TypeScript types** (e.g. a wrong or missing field in `src/types.ts`, a too-narrow parameter type), when a correct docs snippet fails to typecheck. No runtime / behavior changes. After such an edit, `yarn types` and `yarn test` must still pass. List every change in the report.
- Change existing docs snippets as little as possible, and only when they are actually wrong.
- Never put the API key or secret in any file. They are loaded from `test/docs-snippets/.env`.
- In getstream.io, never run `npm run ci` or `npm run lint` for the whole repo. They rewrite thousands of files, including image assets. Use only the per-file commands listed below.

## Read first

1. `/Users/zitaszupera/Stream/stream-chat-js/test/docs-snippets/learnings.md`: issues that earlier agents ran into. Follow it.
2. `/Users/zitaszupera/Stream/stream-chat-js/test/docs-snippets/README.md`: layout, helpers, isolation, cleanup and snippet-marker conventions. Look at `client/dummy.test.ts` as an example.
3. The page itself, and its row in `/Users/zitaszupera/Stream/stream-chat-js/test/docs-snippets/docs-snippets-todo.md`. Also read the page's entries in the TODO's **Blockers detail**, **Setup notes** and **Known docs bugs** sections.

4. When the page doesn't make clear whether an endpoint is client-side or server-side only, check the OpenAPI specs: https://github.com/GetStream/protocol/tree/main/openapi/v2. An endpoint missing from the client spec is server-only. Also check the SDK source in `stream-chat-js/src/` for the method's signature and types.

## What to build

- **Client test** (`test/docs-snippets/client/<section path>/<page>.test.ts`): run each `JavaScript` snippet with a user token, using `getClientSideClient(user)`. Use `getServerClient()` only for setup, cleanup and assertions a client can't do. It returns a `@stream-io/node-sdk` client (see the README's server client notes), never a stream-chat-js `StreamChat` with the secret.
  - If a snippet (or part of it) only works server-side (needs the secret, `user_id` on behalf of others, app settings, ...), it doesn't belong in a client tab: remove it from the page (see "Server-side code in JavaScript snippets") and list it in the report. Don't add a `Node.js` tab for it.
  - If every `JavaScript` fence of the page turns out to be server-only, don't write a test file.
- **Mirror paths.** The test paths mirror the docs path without the `chat/_default/` prefix. Pages under `chat/javascript/` go under `client/javascript/...`.
- **Test structure:**
  - `describe` per page.
  - `beforeAll` creates the shared users and channels with `uniqueId(...)` ids and registers them on a `Cleanup`.
  - `afterAll` disconnects the clients and runs `cleanup.run()`.
  - One `it` per snippet, or per tab group when the snippets in it depend on each other.
- **Snippet markers.** Every `JavaScript` fence on the page needs exactly one marker in a test (`Node.js` fences are ignored). `yarn test-docs-sync` checks the format and the coverage.
  - Wrap the docs code like this:
    ```ts
    // #region snippet docs="_default/04-messages/01-send_message.md" heading="Sending a Message" tab="JavaScript" index=1
    // COPY: channelId="general", userId="john"
    ...docs code...
    // #endregion snippet
    ```
  - `docs` is the page path relative to `content/docs/chat/`.
  - `heading` is the exact text of the nearest heading above the fence.
  - `tab` is the fence label, or `unlabelled`.
  - `index` (default 1) counts fences with the same heading text and tab on the page. If a key is wrong, the sync check lists the page's fence keys.
  - Everything between the markers must be the docs code. Setup goes before the region and assertions after it.
  - **COPY** (optional, first line(s) of the region): `name="docs literal"` pairs. Where the docs use fixed values ("john", "general", "messageID"), use variables in the test, and the sync check replaces each variable with its literal before comparing. Don't use COPY variables as object keys or in shorthand properties (`{ userId }`).
  - Comment-only fences (e.g. `// This is a server-side only feature...`) are skipped by the sync check and need no marker. Every other `JavaScript` fence gets a real region: blocked or untestable snippets go inside `it.skip('BLOCKED: ...')` so they are still typechecked. A fence that isn't JavaScript code (e.g. a bare data shape) is a docs bug: rewrite it as code that runs (e.g. reading and logging the fields), and report it.
- **Assertions.** After each snippet, add basic `expect`s proving that it did what the docs say. For example, check that the response contains the new field, or re-query and check that the state changed. Don't over-assert on volatile fields.
- **Naming**: the id or name of every resource you create comes from `uniqueId(...)` (campaigns: `name`; polls: create them as a `uniqueId` user). The automatic leak check after each file only finds resources named this way. If it reports a `LEAK`, fix your cleanup; don't work around the check.
- **App-level side effects** (app settings, built-in channel types, grants, roles, retention policies, multi-tenancy, push config, ...): pages are run **one at a time**, so changing them is allowed.
  - Read the original value first and restore it with `cleanup.add(...)`.
  - The check after each file fails with `DRIFT` if app settings or pre-existing channel types differ from before the file ran.
  - Prefer `uniqueId` channel types or `config_overrides` when the snippet allows it.
- **Channel types are eventually consistent.** After `createChannelType` or `updateChannelType`, API nodes can disagree for up to ~30s. A `create()` can succeed and the next `sendMessage` still fail with "channel type does not exist".
  - Call `await waitForChannelTypePropagation()` (from `helpers/wait.ts`) right after the create/update, outside the snippet region.
  - Push the name to `cleanup.channelTypes` straight after `createChannelType`. `Cleanup` deletes it after the channels are gone. Never delete channel types in your own cleanup code.
- **Blockers** (the page's Blockers cell in the TODO):
  - ⛔ snippets go in `it.skip('BLOCKED: <reason>', ...)` so they are still typechecked.
  - 🔗 "requires webhook to test": run and assert the stream-chat-js calls (e.g. set the hook URL, read it back, restore it). Don't try to verify delivery.
  - If you find a new blocker, use `it.skip('BLOCKED: <reason>')`, mark the page `[~]` and report it, with the exact API error.
- **Guest users** get their id rewritten to `guest-<uuid>-<requested id>`. Register `client.userID` for cleanup, not the id you passed.
- **Partial snippets** (fragments like `filters = {...}` or `...` placeholders): wrap them in the minimal code needed to compile and run. The region still holds exactly the docs text.

## Server-side code in JavaScript snippets

- If a `JavaScript` snippet is server-only (it fails with a user token, e.g. 403 code 17 or "only allowed when using server side auth"), **remove the `JavaScript` fence**. Don't add or change a `Node.js` tab. Record the exact client-side error in the report.
- If only part of the snippet is server-only (e.g. one field like `channel_role`, or a line naming the acting user), remove just that part from the `JavaScript` fence and keep the rest. Probe each part client-side before deciding.
- Acting-user fields (`user_id`, `user`, `created_by_id`, a `userId` option naming who performs the action): remove one only if the client-side OpenAPI spec (`chat-clientside-api.json`, see "Read first") doesn't have it on that endpoint's request schema. If it does, keep it and test it. Cite the operation id and schema in the report either way.
- Don't remove a `JavaScript` fence just because it is a fragment or untestable for other reasons.

## Editing the docs page

- Write fixes from the test with `DOCS_SYNC_WRITE=<page path, e.g. _default/04-messages/01-send_message.md> yarn test-docs-sync`. This writes every region of that page into its fence, applying the COPY values and the docs prettier style (double quotes). Don't paste snippets by hand.
- Follow `/Users/zitaszupera/Stream/getstream.io/content/docs/AGENTS.md`. In particular, no em-dashes in prose or comments.
- Then run, from `/Users/zitaszupera/Stream/getstream.io/content/docs`:
  - `npx prettier --write <page path>`
  - `npx markdownlint-cli2 --config .markdownlint-cli2.cjs <page path>`

## Faulty docs snippets

If a docs snippet is wrong (wrong method name or signature, a type error against `src/`, wrong response shape, a runtime API error that isn't caused by test setup):

1. Make the smallest fix that makes it correct, in the test region.
2. Write it to the docs page with `DOCS_SYNC_WRITE=<page path> yarn test-docs-sync`, then check `git diff` in getstream.io: only the intended fence should change.
3. Record it for the report as before/after with the reason and the evidence (error message or type error).

If the snippet is correct but stream-chat-js types reject it, fix the type in `src/` (types only) instead of the snippet.

If you're not sure whether the snippet or your setup is wrong, don't edit the docs. Mark it as an open question in the report instead.

## Gates (all must pass before you finish)

Run these from `/Users/zitaszupera/Stream/stream-chat-js`:

```sh
yarn test-docs <your test files>     # green, with no `LEAK` or `DRIFT` error
yarn types-docs                      # no type errors (strict TS, no `any` escapes, no `!` non-null assertions)
yarn eslint test/docs-snippets         # zero warnings (same rules as src/: `import type`, sorted import members, no `!`, no unused vars)
npx prettier --check test/docs-snippets
yarn test-docs-sync                  # every fence of the page covered, every region identical to its docs fence
```

Don't use `@ts-ignore`/`@ts-expect-error` to silence a docs snippet. A type error in a snippet is either a docs bug (fix it as above) or an SDK typing bug (fix the type in `src/`, types only, and report it).

Finally, update the page's row in `/Users/zitaszupera/Stream/stream-chat-js/test/docs-snippets/docs-snippets-todo.md`: `[x]` when done, `[~]` when there are open questions.

## Final report (your last message)

1. **Files created/changed**: test files, plus the docs page with a one-line summary.
2. **Docs snippet corrections**: for each one, a before/after diff, the reason, and the evidence. These need human review.
3. **Skipped / untestable snippets**: for each one, the snippet and why.
4. **Removed server-side code**: each removed fence or part of a fence, with the client-side error (or the reason) that shows it is server-only.
5. **stream-chat-js type fixes**: every `src/` change as a diff, with the snippet that needed it.
6. **Possible SDK issues**: runtime problems that look like stream-chat-js bugs rather than docs bugs (not fixed).
7. **Proposed learnings** for `/Users/zitaszupera/Stream/stream-chat-js/test/docs-snippets/learnings.md`: a numbered list of short, reusable lessons that would have saved you time (e.g. "`channel.muteStatus()` needs a watched channel"). Skip page-specific trivia. The user will approve or reject each one.
