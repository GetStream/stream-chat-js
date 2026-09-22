/**
 * Compile-time exhaustiveness guard. Call from a `switch`'s `default` arm: TypeScript narrows the
 * value to `never` only when every member is handled, so adding one breaks the build here.
 *
 * Only point this at a union this package declares — aiming it at anything under `src/gen` would
 * break the build on every unrelated OpenAPI regeneration.
 *
 * @internal
 */
export const ensureExhausted = (value: never, message: string): never => {
  throw new Error(`${message} Received: ${JSON.stringify(value)}`);
};
