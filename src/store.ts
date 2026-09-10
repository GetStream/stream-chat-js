/**
 * Re-exported from `@stream-io/state-store` so the ~38 modules using it keep a stable `./store`
 * specifier.
 *
 * Do not reintroduce a local copy: TypeScript compares classes with `protected` members
 * nominally, so a second `StateStore` declaration breaks `useStateStore(i18n.state, …)` in the
 * UI SDKs even when the two are byte-identical.
 *
 * Named re-exports rather than `export *` — a star re-export of an external package makes
 * esbuild emit a runtime `__reExport` shim instead of static bindings.
 */
export { isPatch, MergedStateStore, StateStore } from '@stream-io/state-store';
export type {
  Handler,
  Patch,
  Preprocessor,
  RemovePreprocessor,
  Unsubscribe,
  ValueOrPatch,
} from '@stream-io/state-store';
