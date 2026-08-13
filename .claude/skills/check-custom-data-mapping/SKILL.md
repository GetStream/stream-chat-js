---
name: check-custom-data-mapping
description: Audit newly generated API models for `custom` fields that need a `Custom*Data` type and update the mapping in scripts/apply-custom-data-types.mts. Run after `yarn generate-client` (or any regeneration of src/gen) and before committing the regenerated models.
---

# Check custom-data mapping after model generation

The OpenAPI generator emits `custom: Record<string, any>` for every model that carries
custom data. `scripts/apply-custom-data-types.mts` is a codemod that rewrites those fields
to the module-augmentable `Custom*Data` interfaces from `src/custom_types.ts`, driven by two
hand-maintained maps inside the script:

- `CUSTOM_DATA_MAPPING` — `interfaceName → CustomXData`, for `custom` fields in an interface body.
- `FILTER_CUSTOM_MAPPING` — `` `${interfaceName}.${filterField}` → CustomXData ``, for the
  `custom: { type: Record<string, any>; … }` entry inside a `Filters<{ … }>` block.

When the spec adds a model, it lands in `src/gen/models/index.ts` with no map entry, so its
`custom` field silently stays `Record<string, any>` and integrators lose their augmentation on
that shape. **This skill finds those and adds the entries.**

`channel_custom` needs no map entry — the codemod always rewrites it to `CustomChannelData`.

## Step 0 — the shortcut: is there anything to do at all?

**Run this first. Most runs end here.** The regenerated models are still uncommitted at this
point, so the diff answers it directly — no baseline to maintain.

```bash
# 1. did the generated models change at all?
git diff --quiet HEAD -- src/gen/models/index.ts && echo "UNCHANGED"

# 2. models added by this regeneration that the codemod could not map:
comm -12 \
  <(git diff -U0 HEAD -- src/gen/models/index.ts \
    | sed -n 's/^+export interface \([A-Za-z0-9_]*\).*/\1/p' | sort -u) \
  <(node ./scripts/apply-custom-data-types.mts -i ./src/gen/models/index.ts 2>&1 >/dev/null \
    | sed -n 's/^Skipped \([A-Za-z0-9_]*\)[. ].*/\1/p' | sort -u)
```

**`UNCHANGED`, or no output from the second command, means there is nothing to do.** Stop
immediately: report "no new models carrying custom data — mapping unchanged" and do nothing
else. Do not read the mapping, do not open the generated file, do not run lint or types. The
regeneration already ran them.

Names that pre-date this regeneration are deliberately invisible here — they were audited when
they arrived and left unmapped on purpose. The diff is the filter; do not re-litigate them.

Two edge cases worth one command each:

- **An existing model gained a `custom` field** (rather than a whole new model appearing). It
  will not show up as `+export interface`, so also check
  `git diff -U0 HEAD -- src/gen/models/index.ts | grep -E '^\+\s*custom\??: Record<string, any>;'`.
  Extra hits beyond the new interfaces mean an old model started carrying custom data — find it
  with `grep -n` around the added line and treat it like a new name.
- **The regeneration was already committed**, so the diff is empty. Diff against the commit
  before it instead: `git diff -U0 HEAD~1 HEAD -- src/gen/models/index.ts`.

If names come out of this step, those — and only those — are what the rest of the skill is
about.

## Step 1 — see the full picture (only when Step 0 printed something)

The codemod reports every unmapped occurrence on stderr:

```bash
node ./scripts/apply-custom-data-types.mts -i ./src/gen/models/index.ts 2>&1 >/dev/null
```

It prints one line per unmapped occurrence:

```
Skipped <Interface>.custom — no mapping
Skipped <Interface>.<field> filter custom — no mapping
```

Two prerequisites, or the output is meaningless:

- **The file must already be Prettier-formatted.** The codemod anchors `export interface` and
  the closing `}` to column 0; raw generator output is indented, and against it every
  interface-scoped rewrite is skipped silently. `scripts/generate-client.sh` formats before
  invoking the codemod. If you are unsure, run
  `yarn exec prettier --write src/gen/models/index.ts` first — that one file only, since
  pre-formatting the API classes leaves stray blank lines once `eslint --fix` runs over them.
- The codemod **writes in place** and is idempotent — running it here is safe and is a step
  you need anyway.

## Step 2 — decide, per unmapped name

Feeds, Moderation, and flag surfaces (`Feeds*`, `Moderation*`, `*FlagResponse`, `FlagRequest`,
`UpsertActionConfig*`, `ActionLogResponse`) stay unmapped — their `custom` is not part of the
chat client's custom-data contract. Never add mapping entries for those.

Judge by the fields, not the name. `ChannelMetadata` reads like an internal shape but carries
`cid` / `member_count` / `last_message_at`, so its `custom` is channel custom data and it is
mapped; `ModerationCallResponse` carries call fields, so its `custom` would need a call-scoped
type that does not exist and it stays unmapped. When a name is unfamiliar, open the interface
and look at what sits next to `custom`.

The names Step 0 printed are new and each needs a decision. Map one when
the model describes an entity the SDK exposes custom data on; pick the type by what the model
*is*, not by its name suffix:

| Entity                | Type                   | Existing examples                                          |
| --------------------- | ---------------------- | ---------------------------------------------------------- |
| Attachment / OG scrape | `CustomAttachmentData` | `Attachment`, `GetOGResponse`                              |
| Channel               | `CustomChannelData`    | `ChannelInput`, `ChannelResponse`                          |
| Channel member        | `CustomMemberData`     | `ChannelMemberRequest`, `ChannelMemberResponse`            |
| Message / draft       | `CustomMessageData`    | `MessageRequest`, `DraftPayloadResponse`                   |
| Reaction              | `CustomReactionData`   | `ReactionRequest`, `ChatReactionResponse`                  |
| Thread                | `CustomThreadData`     | `ThreadResponse`, `ThreadParticipant`                      |
| User                  | `CustomUserData`       | `UserRequest`, `OwnUserResponse`, `EntityCreatorResponse`  |
| Poll                  | `CustomPollData`       | `CreatePollRequest`, `PollResponseData`                    |
| Poll option           | `CustomPollOptionData` | `PollOptionRequest`, `PollOptionResponseData`              |
| WS event              | `CustomEventData`      | every `*Event` interface, plus `CustomEvent`/`EventRequest` |

Rules of thumb:

- **Every new `*Event` interface gets `CustomEventData`.** That block is exhaustive by
  construction — a missing event is always a bug, never a decision.
- Request/response pairs for the same entity both get the same type
  (`XRequest` and `XResponse` are mapped together).
- If a model genuinely needs a custom-data type that does not exist in `src/custom_types.ts`,
  **stop and report it — do not invent one.** Adding a `Custom*Data` interface is a public API
  change (it is module-augmented by integrators and re-exported from `src/index.ts`), so it
  needs a human decision, not a codemod entry.
- When a new name is ambiguous, leave it unmapped and report it rather than guessing. An
  unmapped field is a missing feature; a wrongly mapped one is a wrong public type.

## Step 3 — update the mapping

Edit `scripts/apply-custom-data-types.mts` only — never hand-edit `src/gen/models/index.ts`,
the codemod is its only writer.

- `CUSTOM_DATA_MAPPING` is grouped by `// CustomXData` comment blocks, alphabetical within each
  block. Insert into the right group in the right position.
- `FILTER_CUSTOM_MAPPING` is a flat, alphabetically sorted map keyed by
  `'Interface.fieldName'`. Its keys are compound because one interface can carry several filter
  blocks (`SearchPayload.filter_conditions` vs `SearchPayload.message_filter_conditions`).

Names you decide **not** to map need no bookkeeping — the next regeneration's diff will not
list them again, because they will no longer be new.

## Step 4 — apply and verify

```bash
node ./scripts/apply-custom-data-types.mts -i ./src/gen/models/index.ts
yarn lint-fix
yarn types
```

The codemod's summary line (`Rewrote N custom + N channel_custom + N filter custom fields`)
should account for every entry you added. `yarn types` must pass — a failure here usually means
the chosen `Custom*Data` type conflicts with how the model is consumed in `src/`.

## Step 5 — report

State plainly:

1. **Added** — each new map entry, as `Interface → CustomXData`.
2. **Deferred** — new unmapped names you chose not to map, each with a one-line reason
   (out-of-scope surface, ambiguous, or would need a new `Custom*Data` type). Anything needing a
   new type in `src/custom_types.ts` goes here, called out as needing a human decision.
3. **Unchanged** — if Step 0 printed nothing, this is the whole report: one line, no mapping
   touched, no commands run beyond Step 0.

If you added entries, mention that `src/gen/models/index.ts` changed as a result and should be
committed alongside the script.
