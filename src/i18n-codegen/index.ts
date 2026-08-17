/**
 * Build-time codegen for a UI SDK's translation catalog, published as `stream-chat/i18n/codegen`.
 *
 * **Node-only.** This reads the filesystem and uses the TypeScript parser API, so it must never be
 * reachable from `stream-chat/i18n` — which is why it lives beside `src/i18n/` rather than inside it.
 * `scripts/bundle.mjs` asserts that boundary at build time.
 *
 * `typescript` is injected through {@link GeneratorConfig.ts} rather than imported, so `stream-chat`
 * does not depend on the compiler.
 *
 * Each SDK keeps a thin script that supplies its own paths:
 *
 * ```ts
 * import ts from 'typescript';
 * import { generateI18nKeys } from 'stream-chat/i18n/codegen';
 *
 * generateI18nKeys({
 *   ts,
 *   runtimeDefaultsPath: 'src/i18n/runtimeDefaults.ts',
 *   keysOut: 'src/i18n/keys.ts',
 *   fixtureOut: 'src/i18n/__tests__/catalog.fixture.json',
 * });
 * ```
 */
export * from './callSites';
export * from './generate';
export * from './guards';
export * from './stringMaps';
export * from './types';
