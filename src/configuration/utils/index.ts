// Only the modules that were already public belong here — `src/configuration/index.ts` re-exports this
// barrel wholesale, so anything added becomes public API. `applyInstanceConfiguration`,
// `copyConfigPatch`, `deepFreezeConfig` and `declarativeSlices` are `@internal` and are imported by path
// instead.
export * from './serverAuthority';
