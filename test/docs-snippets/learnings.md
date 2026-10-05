# Docs snippet tests: learnings

Lessons collected from agent runs. Read this before working on a page.
Entries are added only after the user approves them (agents propose them in their final report).

## Setup and tooling

- To probe API behavior quickly, write a throwaway vitest file under `test/docs-snippets/{client,server}/` that logs each call's result or error. It still runs the leak check, so register what it creates, and delete the file before finishing.
- Fences containing `import ... from "stream-chat"` can be regions: `stream-chat` is aliased to `src` (vitest `resolve.alias` + tsconfig `paths`). Put the region at module level, below the other imports, with the values it uses (e.g. `const apiKey`) declared above it, since a `const` after it would be in the TDZ. Example: `client/02-init_and_users/02-init_and_users.test.ts`. Don't `#docs-ignore` these fences.
- `StreamChat.getInstance` is a singleton for the whole test file. To run another `getInstance` snippet with different options, reset it outside the region: `Reflect.set(StreamChat, '_instance', undefined)`.
- Strict `types-docs` flags optional response fields: e.g. `getAppSettings()` types `app` as optional, so read `app?.field` (TS18048 otherwise).
- If a snippet calls SDK methods without awaiting or keeping the result (e.g. `channel.queryMembers({...});`), `vi.spyOn(obj, 'method')` before the region, await `spy.mock.results.map((r) => r.value)` after it to assert on the responses, then `spy.mockRestore()` (a second `spyOn` on the same method returns the old spy with its call history).

## API and SDK behavior

- Since v9, channel `name` (and other fields like `image`) are custom data, not in `ChannelData`/`ChannelResponse`. `test/docs-snippets/custom-types.d.ts` augments `CustomChannelData` with `name`, so snippets passing `{ name }` typecheck as-is. If a snippet needs another custom field, add it there, using the matching interface (`CustomMemberData` for member fields like `code_name`, etc.); no casts or typed client views in tests.
- To prove a channel is watched, check that its events reach the client: subscribe with `channel.on('message.new', ...)`, send a message server-side, and await the event. `client.activeChannels[cid]` proves nothing (`client.channel()` adds the channel there before any `watch()`), and `channel.watch()` returns `watchers` only when a watchers limit is requested.
- `connectUser`, `connectAnonymousUser` and `setGuestUser` resolve to `void | ConnectionOpen` (`undefined` when a healthy connection already exists). A snippet reading `response.me` fails `types-docs` with TS18048: fix the docs (`response?.me`), not the SDK type.
- `team_id` and multi-tenancy: with multi-tenancy off, any `team_id` is rejected ("team_id is not supported when multi-tenancy is not enabled", code 4); with it on, client-side calls must pass it ("team_id is required when multi-tenancy is enabled"). Server-side `queryUserGroups` works in both modes. Snippets with and without `team_id` need separate phases (e.g. a nested `describe` that turns multi-tenancy on and restores it).
- Toggling `multi_tenant_enabled` is eventually consistent across API nodes (a few seconds; one node returned the old value after 5 matching reads). Poll `getAppSettings` until ~20 consecutive reads agree, both after enabling and after restoring.
- `disable_auth_checks` (needed for `devToken` snippets) can be toggled now that the app is in development mode; save and restore it. The WS edge accepts dev tokens later than `getAppSettings` reports the new value (`connectUser` fails with 401 code 5 "development tokens are not allowed for this application"): after enabling, retry a throwaway dev-token `connectUser` outside the region until it succeeds (see `waitForDevTokensAccepted` in `client/02-init_and_users/01-client_tokens_and_authentication.test.ts`).
- Client-side filters on `disabled` (e.g. `queryChannels` with `{ disabled: true }`) need the `ReadDisabledChannel` permission, which role `user` lacks (error code 17). Assert the rejection client-side and run the filter server-side with `user_id`.
- Predefined filters: `createPredefinedFilter({ name: uniqueId(...), operation: 'QueryChannels', filter: {...} })` is usable immediately, client-side and server-side. Register `cleanup.add(() => serverClient.deletePredefinedFilter(name))` and put the docs' filter name in a COPY variable.
- `$and`/`$nor` (`ArrayOneOrMore`) and `$or` (`ArrayTwoOrMore`) are tuple types. A filter stored in a `const` is inferred as a plain array and isn't assignable to `ChannelFilters`. If the region is only the filter fragment, run it after the region via the raw endpoint (`client.post(`${client.baseURL}/channels`, { filter_conditions, ... })`) instead of casting.
- `client.channel(type, id, data)` only builds a local object. A snippet that goes straight to `updatePartial`/`update`/... on a new id fails with 404 code 16 "Can't find channel": that's a docs bug, fix it by adding `await channel.create()` to the snippet.
- Partial updates accept dot-notation nested paths (`set: { "channel_detail.topic": ... }`, `unset: ["channel_detail.rating"]`). `PartialUpdateChannel` now types them via a `${string}.${string}` index signature in `src/types.ts`; the user/message/member partial-update types may need the same type fix when their pages come up.
- Server-side `channel.update(data, message)` needs `user_id` on the update message; the response then contains `message` to assert on.
- Sort objects stored in a variable before the call (`const sort = { last_message_at: -1 }`) fail strict TS: `-1` widens to `number`, and `ChannelSort`/`MemberSort`/... want `1 | -1`. Fix the docs by inlining the arguments into the call: inline all of them (filter, sort, options), not only the sort, e.g. `queryChannels({ type: "messaging" }, [{ last_message_at: -1 }], { limit: 15 })`. The same applies to `let` variables the snippet reassigns with a different shape (`options = { created_at_before }` after `{ user_id_lt }` fails with TS2353): use one call per value. Keep a variable only when the snippet uses it more than once or is a bare fragment with no call. Don't use `as const` (fences are plain JS) and don't widen the SDK type.
- Re-adding an existing member with `addMembers` is a silent no-op: new custom data or `channel_role` is ignored. Use `updateMemberPartial`, or add a different user.

## Client-side vs server-side

- Server-only `JavaScript` snippets (they fail with a user token) are removed from the page; only the `Node.js` tab stays. Don't keep a `JavaScript` region for them in the server test. If only part of a snippet is server-only (e.g. setting `channel_role` in `updateMemberPartial`), remove just that part from the `JavaScript` tab and keep the rest client-side; the `Node.js` tab keeps the full version.
- Member role changes are server-only: client-side `addModerators`/`demoteModerators` fail with 403 code 17 ("changing channel member roles is not allowed client-side"), and `updateMemberPartial` with `channel_role` fails with code 17 ("this channel role can only be updated server side"). Client-side `updateMemberPartial` of custom fields works for the connected user (with or without `{ userId: <own id> }`); another user's `userId` fails with 400 code 4. Client-side `addMembers([{ user_id, channel_role }])` for a new member does work (channel owner, `messaging`).

## Docs conventions

- If the page's existing Node.js tabs call the server client `client`, use `client` in the server test's regions and keep a separate `serverClient` for setup and cleanup.
- Undefined app-supplied placeholders (e.g. `tokenProvider`) aren't docs bugs: define them in the test just before the region (e.g. `const tokenProvider = () => Promise.resolve(serverClient.createToken(userId))`, which also satisfies `require-await`), and don't change the docs.
- A fence that declares the same `const` twice (e.g. two `const result = ...` or `const filter = ...` showing alternatives) is a real SyntaxError and TS2451. Fix the docs by renaming only the later declarations with descriptive names (`aroundResult`, `membersFilter`); don't split the fence.
- When the docs use an identifier (not a string literal) like `randomID`, name the test variable the same and don't put it in COPY. A quoted COPY value (`randomID="randomID"`) turns it into a string literal, and `DOCS_SYNC_WRITE` then silently writes the quoted string into the docs.

## Isolation and cleanup

- Distinct channels (no id) get an auto id `!members-...`: push `channel.cid` to `cleanup.channels` right after `create()`/`watch()`, and use `uniqueId` members.
- Guest users: push `client.userID` (the rewritten `guest-<uuid>-<id>`) to `cleanup.users` in a `finally` around the snippet, so it is cleaned up even if a later assertion fails.
- Some names are unique per app (e.g. user group names: `a group with name "Design Team" already exists`), and the leak check matches by id or name. Use a COPY variable from `uniqueId` for every such `name`, including the new name in update/rename snippets.
- Server-side `deleteUsers` of an id that was never created succeeds, so register a user on `cleanup` before the snippet creates it.
- Polls and campaigns are NOT deleted when their creator user is hard-deleted. Delete them explicitly via `cleanup.add(...)` (`deletePoll(id, userId)` needs a `user_id` server-side; `deleteCampaign(id)`), and give campaigns a `uniqueId(...)` name so the leak check can find them.
- To assert ordering or offset pagination exactly, create ~12 channels in `beforeAll` and send one message to each, sequentially (not `Promise.all`): `last_message_at: -1` order is then the reverse of creation order. Same for message pagination (`id_lt`/`id_around`): send ~30 messages sequentially, record their ids in order, and compare pages to exact slices.
- To assert member `created_at` order or `created_at_before` pagination, add members one at a time with `addMembers([id])` in `beforeAll`: members passed together to `create()` can share a `created_at`.
