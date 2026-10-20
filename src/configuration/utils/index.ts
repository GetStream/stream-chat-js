// `src/configuration/index.ts` re-exports this barrel wholesale, so anything added becomes public API.
// Helpers marked `@internal` are imported by path instead.
export * from './serverAuthority';
