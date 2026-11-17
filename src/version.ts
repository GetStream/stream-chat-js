/**
 * The parsed version of this `stream-chat` build.
 *
 * - `prerelease` is the prerelease identifier without its trailing `.N` (`'rc'` for
 *   `10.0.0-rc.35`; a numeric-only id such as `1.0.0-1` has no `.N` and stays `'1'`), or `null`
 *   for a stable release. It is a plain string because this package has
 *   shipped prereleases beyond `alpha` / `beta` / `rc` (`dev`, `insights`, `offline-support-beta`).
 * - `prereleaseNumber` is the number of that trailing `.N` (`35`), or `null` when there is none.
 * - `raw` is the version string exactly as it was given.
 *
 * Outside the esbuild bundles (unit tests, code importing `src/` directly) no version is injected,
 * and the value is that of the `package.json` placeholder, `0.0.0-development`.
 */
export type StreamChatVersion = Readonly<{
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  prereleaseNumber: number | null;
  raw: string;
}>;

/**
 * `major.minor.patch`, an optional `-<id>` with its trailing `.N` split off (lazy, so `rc.35` gives
 * `rc` and `35`, and `offline-support-beta.2` keeps its whole id), and an ignored `+<build>`.
 */
const SEMVER_PATTERN =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+?)(?:\.(\d+))?)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Parses a version string into a {@link StreamChatVersion}. Never throws: a missing or empty value
 * parses as the `package.json` placeholder, and an unparseable one gives zeros (the defaults below)
 * with the input kept in `raw`.
 *
 * @internal
 */
export const parseVersion = (raw: string | undefined): StreamChatVersion => {
  const input = raw || '0.0.0-development';
  const [, major = 0, minor = 0, patch = 0, prerelease = null, prereleaseNumber] =
    SEMVER_PATTERN.exec(input) ?? [];

  return Object.freeze({
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease,
    prereleaseNumber: prereleaseNumber ? Number(prereleaseNumber) : null,
    raw: input,
  });
};

/**
 * The version esbuild's `define` injected, or `undefined` outside the bundles.
 *
 * Keep `process.env.PKG_VERSION` spelled out exactly: `define` replaces that expression and no
 * other (a destructure or `globalThis.process` would ship the fallback). A `typeof process` guard
 * would not survive the replacement either: it compiles to `typeof process !== 'undefined' ?
 * "10.0.1" : undefined`, which is the fallback in every browser. A `try` keeps the literal while
 * still letting an unbundled `src/` import in a browser (no `process`) load.
 *
 * @internal
 */
export const readInjectedVersion = (): string | undefined => {
  try {
    return process.env.PKG_VERSION;
  } catch {
    return undefined;
  }
};

/**
 * The bundle esbuild's `define` injected (`node-cjs`, `browser-cjs`, `browser-esm`), or `undefined`
 * outside the bundles. Same spelling rule as {@link readInjectedVersion}.
 *
 * @internal
 */
export const readInjectedClientBundle = (): string | undefined => {
  try {
    return process.env.CLIENT_BUNDLE;
  } catch {
    return undefined;
  }
};

/**
 * The version of this `stream-chat` build, for feature detection between packages (a UI SDK
 * checking which core it runs against). To find out whether one specific API exists, checking for
 * the API itself (`'method' in client`) is more precise.
 *
 * Only the esbuild bundles carry the real version. Imported any other way (`src/` through an alias,
 * a linked checkout) it is `0.0.0-development`, so `major === 0` means **unknown**, not old: a
 * feature check should treat it as "assume the newest behaviour" rather than take a legacy path.
 *
 * Both calls are annotated: `#__PURE__` covers one call, not its arguments.
 */
export const version: StreamChatVersion = /* #__PURE__ */ parseVersion(
  /* #__PURE__ */ readInjectedVersion(),
);
