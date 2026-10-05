import { describe } from 'vitest';

/**
 * Firebase service-account JSON from `FIREBASE_CONFIG` in test/docs-snippets/.env, or
 * undefined when it's missing / not valid JSON. Never log the value.
 *
 * Push tests are NOT end-to-end: nothing checks that a notification arrives. The
 * credentials only exist because the API validates them when a push provider / push
 * config is saved, so the snippets need real ones to succeed.
 *
 * In .env, wrap the multi-line JSON in single quotes: FIREBASE_CONFIG='{ ... }'
 */
export const firebaseConfig = (): Record<string, unknown> | undefined => {
  const raw = process.env.FIREBASE_CONFIG?.trim();
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

/** `FIREBASE_CONFIG` as the string `credentials_json` expects. Only call inside `describePush`. */
export const firebaseCredentialsJson = () => {
  const config = firebaseConfig();
  if (!config) throw new Error('FIREBASE_CONFIG is not set (use describePush)');
  return JSON.stringify(config);
};

/**
 * `describe` when push credentials are available, `describe.skip` otherwise, so a push
 * test file still typechecks but every test in it is skipped without credentials.
 */
export const describePush = describe.skipIf(!firebaseConfig());
