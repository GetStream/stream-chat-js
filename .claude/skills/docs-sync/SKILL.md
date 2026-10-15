---
name: docs-sync
description: Sync the stream-chat-js docs snippet tests (test/docs-snippets) with a getstream.io docs checkout. Asks for the docs repo, runs `yarn test-docs-sync` against it, brings the tests up to date with docs changes (docs win), adds tests for new snippets, and writes fixes for broken snippets back to the docs. Use when the user asks to sync, check or update the docs snippets or docs snippet tests.
argument-hint: '[path to the getstream.io checkout or its content/docs folder]'
---

# Docs sync

The tests in `test/docs-snippets/` run the client-side `JavaScript` snippets of the Stream Chat docs against a real Stream app. Each docs fence has exactly one marked region in a test, and `yarn test-docs-sync` checks that they still agree. This skill makes them agree again after either side changed.

**Docs have preference.** When a region and its fence differ, the docs version is the source of truth: update the test to match it. Change the docs only when the docs snippet doesn't work (type error against `src/`, runtime error that isn't caused by test setup, wrong response shape), and then write the fix back from the test.

All paths below are relative to the stream-chat-js repo root unless they start with `$DOCS_DIR`.

## 1. Find the docs folder

If the user passed a path as the argument, use it. Otherwise ask for it with AskUserQuestion: "Where is the getstream.io docs checkout?", offering `../getstream.io` (the default sibling checkout) as the first option, and accepting any path through "Other".

Resolve it to the `content/docs` folder:

- A repo root (has `content/docs/_sidebars/`): use `<path>/content/docs`.
- A path that already ends in `content/docs` (has `_sidebars/`): use it as is.
- A bare repo name (e.g. `getstream.io`): try it as a sibling of this repo (`../<name>`).
- Anything else, or a folder without `_sidebars/`: tell the user what was checked and ask again. Never guess a path from another machine.

Make it absolute and call it `$DOCS_DIR`. Pass it as `DOCS_DIR=$DOCS_DIR` on **every** `yarn test-docs-sync` call: without it, the sync check falls back to the sibling checkout and, if that doesn't exist, silently skips the docs comparison.

Then show the user, before changing anything:

- the docs repo's current branch and `git status --short` (run git in `$DOCS_DIR`),
- the stream-chat-js branch and `git status --short`.

If either repo has uncommitted changes, say so: your edits will mix with them. Don't stash, commit or switch branches in either repo.

## 2. Read the conventions

Before editing tests, read:

1. `test/docs-snippets/AGENTS.md`: test conventions and API quirks. Follow it.
2. `test/docs-snippets/README.md`: layout, commands and the snippet-marker format (fence key, COPY, `DOCS_SYNC_WRITE`).
3. `$DOCS_DIR/AGENTS.md`, if it exists: the docs writing rules (e.g. no em-dashes).

Live tests need `test/docs-snippets/.env` (copy `.env.example`, fill in `STREAM_API_KEY` / `STREAM_API_SECRET` of the docs test app). If it is missing or empty, ask the user for it. Without it you can still sync, typecheck and lint, but you can't tell whether a changed snippet works: say so in the report, and don't change any docs snippet in that case.

## 3. Run the sync check

```sh
DOCS_DIR=$DOCS_DIR yarn test-docs-sync
```

It runs without network and reports four kinds of failure. Collect them all, grouped by docs page, before fixing anything.

| Failure | Meaning |
| --- | --- |
| `snippets without a test region` | A `JavaScript` fence on a tested sidebar page (chat JavaScript, platform) has no region: a new snippet, a new page, or a fence whose key changed (see the next row). |
| `JS fences need label=...` | A JS fence is unlabelled or has another label. |
| `no such fence` | A region's key (`docs`, `heading`, `tab`, `index`) matches no fence: the fence was removed, moved, or its heading was renamed. The failure lists the page's fence keys. |
| `<region> differs from <docs file>:<line>` | The region's code and the fence's code differ. |

**Check that the docs branch matches the SDK first.** Because the docs win, syncing against docs written for another stream-chat-js major (e.g. v9 docs against the v10 tests on a `release-v10` based branch) would rewrite working tests to old API code. If many regions across many pages differ, or the differences look like an API change rather than a docs edit (renamed methods, different argument shapes), stop: show the user both branches and a few example differences, and ask whether this is the right docs checkout before changing anything.

A renamed heading or a reordered fence shows up twice: as `no such fence` for the old key and as a missing region for the new one. Pair them up by code before treating either as a new or removed snippet.

## 4. Fix each failure

Work one docs page at a time.

### Mislabelled fence

Label it `JavaScript` for client code, `Node.js` for server-side code (with or without `@stream-io/node-sdk`). `Node.js` fences are out of scope: never test, add or change them otherwise.

### Region differs from its fence (docs changed)

1. Replace the region's code with the fence's code. Keep the region's COPY line: where the docs use a fixed value that a COPY variable stands for (`channelId="general"`), keep the variable in the region. If the docs changed that literal, update the COPY value. If the docs introduced a new fixed value that would clash with other tests (a fixed user or channel id), add a COPY variable from `uniqueId(...)` for it.
2. Adjust the setup before the region and the assertions after it to the new code (new variables, a different response shape, a new call to assert).
3. Run the page's test: `yarn test-docs <test file>`, then `yarn types-docs`.
4. If it passes, done. If it fails, decide why:
   - **Test setup** (missing user, permission, channel config, eventual consistency): fix the setup, not the region.
   - **SDK bug or wrong type in `src/`** while the snippet is correct: make the smallest fix in `src/` (add or update a unit test under `test/unit/` for runtime fixes), and list it in the report. `yarn types`, `yarn lint` and `yarn test` must still pass.
   - **The docs snippet is wrong**: fix it as described in "Broken docs snippet" below.
   - **Not sure** whether the snippet or the setup is wrong: don't touch the docs. Leave the test failing or put the snippet in `it.skip('BLOCKED: <reason>', ...)` and report it as an open question.

### Marker points at no fence

- **Heading renamed or fence moved/reordered**: update the marker's `heading` / `tab` / `index` to the key the failure lists (it matches the fence with the same code).
- **Fence removed from the docs**: remove the region together with its `it` (or the part of the `it` that only exists for it) and any setup only it used. If a whole page was removed or left the sidebar, remove its test file.

### New fence without a region

Write a test for it in the page's test file (create the file if the page is new). The path mirrors the docs path relative to `content/docs/`, without `_default/`: `chat/_default/04-messages/01-send_message.md` → `test/docs-snippets/pages/chat/04-messages/01-send_message.test.ts`. Follow `test/docs-snippets/AGENTS.md` (isolation with `uniqueId`, `Cleanup`, one `it` per snippet, basic `expect`s after each region). In short:

- Run the snippet with a user token (`getClientSideClient(user)`). Use `getServerClient()` (a `@stream-io/node-sdk` client) only for setup, cleanup and assertions a client can't make.
- Everything between the markers is the docs code; setup goes before, assertions after. Fragments get the minimal surrounding code to compile and run.
- Comment-only fences (e.g. "This is a server-side only feature...") need no region.
- A fence that isn't code (e.g. a bare data shape) is a docs bug: rewrite it as code that runs (e.g. reading and logging the fields), and report it. Never remove a `JavaScript` fence just because it is a fragment or can't be tested: wrap it, or put it in `it.skip`.
- A snippet the test app can't run goes in `it.skip('BLOCKED: <reason>', ...)` so it is still typechecked; report the exact API error.
- **Server-only code in a `JavaScript` fence** (fails with a user token, e.g. 403 code 17 or "only allowed when using server side auth"): remove that fence, or just the server-only part, from the docs. Don't add a `Node.js` tab for it. To decide whether an endpoint or an acting-user field (`user_id`, `created_by_id`, ...) is client-side, check the client-side OpenAPI spec (`chat-clientside-api.json` in https://github.com/GetStream/protocol/tree/main/openapi/v2): an endpoint or field missing from it is server-only. Report every removal with the error.
- A fence from another product (Feeds, `@stream-io/feeds-client`, React / React Native tabs on platform pages) isn't tested: report the page and heading so it can be added to `EXCLUDED_SECTIONS` in `test/docs-snippets/sync/parse.ts`. Don't edit `parse.ts` without asking the user.

### Broken docs snippet

Only when the docs snippet itself doesn't work (wrong method name or signature, a type error against `src/`, a runtime API error not caused by setup):

1. Make the smallest fix in the test region.
2. Write it to the docs: `DOCS_DIR=$DOCS_DIR DOCS_SYNC_WRITE=<page path, e.g. chat/_default/04-messages/01-send_message.md> yarn test-docs-sync`. This writes every region of the page into its fence, with the COPY values applied and the docs prettier style. Never paste snippets into the docs by hand.
3. Check `git diff` in `$DOCS_DIR`: only the intended fences may change. If others changed, a region was out of sync; go back to "Region differs from its fence".
4. Format and lint the page, from `$DOCS_DIR`:
   ```sh
   npx prettier --write <page path>
   npx markdownlint-cli2 --config .markdownlint-cli2.cjs <page path>
   ```
   Never run `npm run ci` or `npm run lint` for the whole docs repo: they rewrite thousands of files, including images.
5. Record the fix for the report: before/after, reason, and evidence (error message or type error).

## 5. Gates

All must pass before you finish:

```sh
DOCS_DIR=$DOCS_DIR yarn test-docs-sync    # no missing, mislabelled, unknown or differing snippets
yarn test-docs <changed test files>       # green, no LEAK or DRIFT error
yarn types-docs                           # no type errors, no @ts-ignore / @ts-expect-error / `!`
yarn eslint test/docs-snippets            # zero warnings
npx prettier --check test/docs-snippets
```

Never silence a docs snippet with `@ts-ignore` / `@ts-expect-error`: a type error in a snippet is a docs bug or an SDK issue.

If you changed `src/`, also `yarn types`, `yarn lint` and `yarn test`.

Run `yarn test-docs` only on the test files you changed: pages may change app settings, so never run several docs test files in parallel.

## Rules

- Don't commit, push, stash or create branches in either repo.
- Never write the API key or secret to any file except `test/docs-snippets/.env`.
- Don't edit `test/docs-snippets/AGENTS.md`, the helpers or the configs. Propose changes in the report instead.
- Change docs snippets as little as possible, and only when they don't work.
- Backend behavior issues that don't block the test (misleading error, inconsistent behavior) go to "Possible API issues" in `test/docs-snippets/docs-snippets-todo.md`, with the page and the exact error.

## Report

End with:

1. **Docs folder** used, and both repos' branches.
2. **Tests updated from the docs**: per page, the regions changed and why the setup/assertions changed.
3. **New and removed tests**: snippets added, regions removed with their fences, renamed markers.
4. **Docs changes**: every fence changed in `$DOCS_DIR` (fixes, labels, removed server-only code), each with before/after, reason and evidence. These need human review.
5. **`src/` fixes**: each change as a diff, with the snippet that needed it.
6. **Open questions**: failing or blocked snippets you couldn't resolve, other-product fences to exclude, API issues added to the TODO.
7. **Proposed additions to `test/docs-snippets/AGENTS.md`**: short, reusable lessons. Skip page-specific details.
