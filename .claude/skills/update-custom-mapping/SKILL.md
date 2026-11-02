---
name: update-custom-mapping
description: Find generated models in src/gen/models whose `custom` field (or `Filters<{ custom }>` entry) is still `Record<string, any>` although a matching `Custom*Data` interface exists in src/custom_types.ts, add them to the mapping tables in scripts/apply-custom-data-types.mts, and re-apply the script to src/gen. Use after `yarn generate-client`, or when the user asks to update, check or audit the custom data type mapping.
---

# Update the custom data mapping

`scripts/apply-custom-data-types.mts` runs after every `yarn generate-client` and rewrites `custom: Record<string, any>` in generated models to the module-augmentation interfaces in `src/custom_types.ts` (`CustomChannelData`, `CustomMessageData`, …), so integrators' augmentations reach the types. It only rewrites what its two tables name:

- `CUSTOM_DATA_MAPPING` — interface name → `Custom*Data`, for a `custom` field in the interface body.
- `FILTER_CUSTOM_MAPPING` — `` `${interface}.${filterField}` `` → `Custom*Data`, for the `custom: { type: Record<string, any> }` entry of a `Filters<{ … }>` block.

(`channel_custom` is always rewritten to `CustomChannelData` and needs no entry.)

A regen that adds a model leaves its `custom` untyped until someone adds it here. This skill finds those and fixes the tables.

All paths are relative to the repo root.

## 1. Collect the candidates

```bash
node .claude/skills/update-custom-mapping/find-unmapped-custom.mts
```

It is read-only and prints the `Custom*Data` interfaces available, every `custom` field / filter `custom` entry in `src/gen/models/index.ts` still typed `Record<string, any>` (with its doc comment and the fields that reference its interface), and any stale table entries.

## 2. Decide each candidate

Map a candidate only when its `custom` **is the custom data of the domain object a `Custom*Data` interface describes** — the same bag an integrator writes through that object's API. Judge from the interface name, the doc comment, what references it, and, when unsure, its other fields (read the interface in `src/gen/models/index.ts`):

- A variant of an already mapped object is a match: e.g. `ChannelPartialUpdateResponse` (the channel in `notification.channel_partial_updated`, with `id`/`type`/`cid` and "custom data for this object") is a channel → `CustomChannelData`. Look at the existing entries for the same object (`ChannelResponse`, `ChannelInput`, …) as a reference.
- Every new `*Event` interface with a `custom` field → `CustomEventData`, as all existing events are.
- Filters: map `Request.filter_field` to the type of the objects being queried (the filter on `QueryChannelsRequest` filters channels → `CustomChannelData`).
- **Not** a match, leave unmapped: objects that merely sit next to a mapped one but have their own custom bag — flags (`FlagRequest`, `MessageFlagResponse`, `ModerationFlagResponse`), moderation payloads / actions / action configs / review queue (including its filter), action logs, calls, and Feeds models (`Feeds*`). A flag on a message is not message custom data. There is no `Custom*Data` for these; the unmapped warning for them is expected.
- `CustomMessageComposerData`, `CustomCommandData` and `CustomEventTypes` are not wire-model custom bags; don't map generated models to them unless a model plainly is a command.

If a candidate is genuinely ambiguous, ask the user (AskUserQuestion) rather than guess — a wrong mapping types data that does not have the integrator's shape.

## 3. Edit the tables

In `scripts/apply-custom-data-types.mts`:

- Add each accepted interface to `CUSTOM_DATA_MAPPING` under the comment group of its type, keeping the group sorted alphabetically.
- Add each accepted filter to `FILTER_CUSTOM_MAPPING`, sorted.
- Remove entries the script reported as stale (the interface or filter field no longer exists in the models).

If an accepted `custom` field has a shape the script's regexes don't match (e.g. not `Record<string, any>`, or an inline object), say so and stop — don't extend the parser silently.

## 4. Re-apply to the generated models

The script is idempotent (it only touches lines still typed `Record<string, any>`, and merges the `custom_types` import), so run it on the checked-in models instead of regenerating:

```bash
node ./scripts/apply-custom-data-types.mts -i src/gen/models/index.ts
yarn prettier --write src/gen/models/index.ts
```

Re-run step 1: the fields you mapped must be gone from the list, and what remains should be only what you decided to leave.

## 5. Verify

- `yarn types` — a newly typed `custom` can break hand-written code that read it as `Record<string, any>`; fix those call sites (they now get the integrator's type, as the other models do).
- `yarn lint`
- `yarn test`

Report to the user: which interfaces/filters were added (and to which type), which were left unmapped and why (grouped, e.g. "moderation / Feeds — no corresponding type"), stale entries removed, and the verification results.
