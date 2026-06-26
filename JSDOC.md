# JSDoc style guide

This repository uses TSDoc-flavored JSDoc. The TypeScript signature is the source of truth for parameter and return **types** and for **optionality** — JSDoc only carries human-readable descriptions and the few semantic tags listed below.

The format is enforced by `eslint-plugin-jsdoc`. Run `yarn lint` to validate locally.

## Canonical block

````ts
/**
 * One-sentence summary in sentence case, ending with a period.
 *
 * Optional longer prose paragraph. Wrap at ~100 columns.
 *
 * @param name - Description in sentence case, ending with a period.
 * @param options - Send options.
 * @param options.skip_enrich_url - Skip URL enrichment for this message.
 * @returns Description of the return value.
 * @throws When the channel is frozen.
 * @deprecated Use {@link newName} instead.
 * @example
 * ```ts
 * client.connectUser({ id: 'foo' }, token);
 * ```
 */
````

## Rules

- **No `{Type}` annotations on `@param` / `@returns`.** TypeScript already provides them. Enforced by `jsdoc/no-types`.
- **No bracketed-optional syntax** (`@param [name]`). TypeScript marks optionality via `?` or default values. Enforced by `jsdoc/check-param-names`.
- **Use `@returns`, not `@return`.** Enforced by `jsdoc/check-tag-names`.
- **Drop legacy tags**: `@method`, `@memberof`, `@class`, `@type` — TypeScript provides these.
- **Allowed tags**: `@param`, `@returns`, `@throws`, `@example`, `@default`, `@deprecated`, `@see`, `@internal`, `@private`, `@experimental`, `@remarks`, `@template`, and the inline `{@link}`.
- **Hyphen before description**: `@param name - description`. Enforced by `jsdoc/require-hyphen-before-param-description`.
- **Destructured object params** use dot notation: `@param options.foo - ...`.
- **`@deprecated`** must point at the replacement: `@deprecated Use {@link newName} instead.`
- **Short single-line form** `/** Foo. */` is allowed only when there are no tags and the description fits on one line.
- **Field-level JSDoc** on interfaces/types may use the single-line form (mirrors `src/gen/models/index.ts`).

## Casing in prose

Apply consistently in JSDoc and `//` comments. Do **not** rewrite identifiers, string literals, or `@example` code blocks.

| Wrong        | Right        |
| ------------ | ------------ |
| `websocket`  | `WebSocket`  |
| `sdk`        | `SDK`        |
| `api`        | `API`        |
| `url`        | `URL`        |
| `json`       | `JSON`       |
| `http(s)`    | `HTTP(S)`    |
| `jwt`        | `JWT`        |
| `id` (prose) | `ID`         |
| `javascript` | `JavaScript` |
| `typescript` | `TypeScript` |

## Reusing field descriptions

Hand-written types in `src/types.ts` and elsewhere often share field names with the OpenAPI-generated types in `src/gen/models/index.ts` (`cid`, `created_at`, `channel_id`, `team`, `duration`, etc.). When documenting such a field, reuse the wording from the generated model for consistency.

## When in doubt

- Cross-check that `@param` names match the actual parameter names.
- Add `@returns` iff the function returns something other than `void` / `Promise<void>`.
- Keep existing wording verbatim except to fix grammar, typos, casing, or factual mismatches with the signature.
