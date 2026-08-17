import type { CallSiteCopy, GuardFailure } from './types';

/**
 * The four hard-fail checks the catalog has to pass.
 *
 * Each is a pure function returning failures as data. The fifth guard both UI SDKs carried — checking
 * that an `EXTERNAL_STRING_KEYS` entry's wording matched the key's catalog copy — is gone, because the
 * map it policed is gone: notifications now resolve through a stable identifier instead of by matching
 * English prose.
 */

/** A key must render one thing. */
export const guardConflictingCopy = (
  conflicts: CallSiteCopy['conflicts'],
): GuardFailure | null => {
  if (!conflicts.length) return null;
  return {
    entries: conflicts.map(
      ({ a, b, file, key }) =>
        `${key}\n    ${JSON.stringify(a)}\n    ${JSON.stringify(b)}  (${file})`,
    ),
    kind: 'conflicting-copy',
    summary:
      `${conflicts.length} key(s) used with conflicting inline copy — a key must render ` +
      `one thing:`,
  };
};

/**
 * A key called without inline copy resolves from the bundled data or not at all.
 *
 * Without this, i18next renders the raw dotted key in the UI — the failure mode is a user seeing
 * `message.status.sent.text` where a word should be.
 */
export const guardUnresolvableKeys = ({
  runtimeDefaults,
  runtimeDefaultsPath,
  withoutCopy,
}: {
  runtimeDefaults: Map<string, string>;
  runtimeDefaultsPath: string;
  withoutCopy: CallSiteCopy['withoutCopy'];
}): GuardFailure | null => {
  const unresolvable = [...withoutCopy].filter(([key]) => !runtimeDefaults.has(key));
  if (!unresolvable.length) return null;
  return {
    entries: unresolvable.map(([key, file]) => `${key}  (${file})`),
    kind: 'unresolvable-key',
    summary:
      `${unresolvable.length} key(s) are called with no inline default and are missing from ` +
      `${runtimeDefaultsPath}.\nThey would render as the raw key. Either pass the English copy ` +
      `inline — t('key', 'Copy') — or add an entry to ${runtimeDefaultsPath}:`,
  };
};

/**
 * A key must not be in both places.
 *
 * The bundled value wins over a `defaultValue`, so a key in both silently renders the bundled string
 * and ignores the call site — meaning an edit to the copy at the call site changes nothing, with no
 * error. This is the bug class that used to hide behind a checked-in `en.json`.
 */
export const guardShadowedKeys = ({
  inlineCopy,
  runtimeDefaults,
  runtimeDefaultsPath,
}: {
  inlineCopy: Map<string, string>;
  runtimeDefaults: Map<string, string>;
  runtimeDefaultsPath: string;
}): GuardFailure | null => {
  const shadowed = [...runtimeDefaults.keys()].filter((key) => inlineCopy.has(key));
  if (!shadowed.length) return null;
  return {
    entries: shadowed.map(
      (key) =>
        `${key}\n    bundled:   ${JSON.stringify(runtimeDefaults.get(key))}\n` +
        `    call site: ${JSON.stringify(inlineCopy.get(key))}`,
    ),
    kind: 'shadowed-key',
    summary:
      `${shadowed.length} key(s) are in both ${runtimeDefaultsPath} and an inline default.\n` +
      `The bundled value wins, so editing the call site would silently change nothing. Remove ` +
      `the ${runtimeDefaultsPath} entry:`,
  };
};

/**
 * A key cannot be both a leaf and a namespace.
 *
 * With i18next's default `keySeparator: '.'` the shorter key would resolve to an object, and a nested
 * resource tree cannot represent both at once. The SDKs set `keySeparator: false` so this is latent
 * rather than active — but it is a landmine for anyone who ever flips that, and cheap to prevent.
 *
 * Compared on segment boundaries, so `poll.title` / `poll.titleText` is fine while `poll.title` /
 * `poll.title.text` is not.
 */
export const guardPrefixCollisions = (keys: string[]): GuardFailure | null => {
  const keySet = new Set(keys);
  const collisions: Array<{ leaf: string; nested: string }> = [];

  for (const key of keys) {
    const segments = key.split('.');
    for (let i = 1; i < segments.length; i++) {
      const ancestor = segments.slice(0, i).join('.');
      if (keySet.has(ancestor)) collisions.push({ leaf: ancestor, nested: key });
    }
  }

  if (!collisions.length) return null;
  return {
    entries: collisions.map(
      ({ leaf, nested }) => `${leaf}\n    is a strict prefix of: ${nested}`,
    ),
    kind: 'prefix-collision',
    summary:
      `${collisions.length} key(s) are a strict prefix of another key — a key cannot be both a ` +
      `leaf and a namespace. Rename one, usually by giving the shorter key a modality segment ` +
      `(.label / .text / .title):`,
  };
};

/** Formats failures the way the generator prints them before exiting. */
export const formatFailures = (failures: GuardFailure[]): string =>
  failures
    .map(
      ({ entries, summary }) =>
        `\n${summary}\n${entries.map((e) => `  ${e}`).join('\n')}`,
    )
    .join('\n');
