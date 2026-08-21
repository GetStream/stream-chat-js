/**
 * Holds the configuration an integrator registers for classes the SDK constructs on their behalf —
 * `Channel`, `Thread`, `MessageComposer` and the client's own managers. Reached as `client.config`.
 *
 * Not to be confused with `client.channelServerConfigs`, which holds the **server-provided channel configs**.
 *
 * There are two ways in, over one mechanism:
 *
 * - `set(tree)` / `setConfig(key, subtree)` — declarative values (page sizes, throttles, feature
 *   flags). The primary surface.
 * - `setSetupFunction(key, fn)` — an imperative escape hatch for behaviour that cannot be expressed as
 *   a value (middleware, comparators, custom request logic).
 *
 * Declarative configuration is applied before the setup function, so a setup function always wins for
 * the same field.
 *
 * Keys are **open**: the four built-ins are typed for autocomplete, but any string works, so a
 * downstream SDK or an integrator can register a key for a class of its own. Stores are therefore
 * created lazily — a key must work whether the setter or the subscriber arrives first.
 *
 * One service per client, not a singleton: a process-global registry would leak configuration between
 * clients, which breaks tests and apps that connect as more than one user.
 */

import { StateStore } from '../store';
import { chatLoggerSystem } from '../logger';
import { mergeWith } from '../utils/mergeWith';
import { isEqual } from '../utils/mergeWith/mergeWithCore';
import { copyConfigPatch } from './utils/copyConfigPatch';
import { getPath, hasPath, isWalkableRecord } from '../utils/objectPath';
import { BUILT_IN_INSTANCE_KEYS, CONSTRUCTION_ONLY_CONFIG_PATHS } from './keys';
import type {
  InstanceConfigOf,
  InstanceConfigState,
  InstanceConfigTree,
  InstanceSetupFunction,
  InstanceSetupKey,
  InstanceSetupState,
} from './types';
import type { DeepPartial } from '../types.utility';

const logger = chatLoggerSystem.getLogger('instance-configuration');

/**
 * Registered by `applyInstanceConfiguration` on behalf of one live instance. The service holds these
 * so `reset` can reach every live instance of a key, and so the registry can tell whether a key has any
 * live instance at all.
 *
 * @internal
 */
/**
 * A handle to one live instance that derives configuration from a key.
 *
 * Deliberately just the re-derivation hook rather than the instance itself: the registry never reads an
 * instance's configuration, it only needs a way to tell the instance to rebuild.
 */
export type ConfiguredInstance = {
  /** The instance's own `initializeConfig`, bound. Invoked by `reset` after both slots are cleared. */
  reinitializeConfig?: () => void;
};

// Stores are keyed by an open string, so their value types cannot be correlated with the key at this
// level. Callers narrow through `getSetupState` / `getConfigState`.
type AnySetupStore = StateStore<InstanceSetupState<InstanceSetupKey>>;
type AnyConfigStore = StateStore<InstanceConfigState<InstanceSetupKey>>;

export class InstanceConfigurationRegistry {
  /**
   * **Setup functions** — the second of the two ways to configure, known as *tier 2* because tier 2 is
   * applied after tier 1 and therefore wins for the same field. Keyed by configuration key: the function
   * registered for `'channel'`, `'messageComposer'` and so on, each wrapped in a store so that registering
   * a setup function is observable.
   *
   * A setup function receives the instance and may do anything, including the things plain data cannot
   * express — branch on the instance, install middleware, swap another function in. Declarative
   * configuration ({@link configStates}) is the other way, and carries values only.
   *
   * A store rather than a bare function because timing is not guaranteed in either direction. Instances
   * subscribe to the store for the relevant key, so a setup function registered after those instances were
   * built still reaches every one of them, and an instance built afterwards picks up the setup function
   * already sitting in the store.
   *
   * Entries appear on first access through {@link getSetupState}, never up front — the key space is open,
   * so the full set of keys is not knowable here.
   */
  private setupStates = new Map<string, AnySetupStore>();

  /**
   * **Declarative configuration** — the first of the two ways to configure, known as *tier 1* because
   * tier 1 is applied before tier 2 and is therefore the layer a setup function overrides. Keyed by
   * configuration key: the subtree registered through {@link InstanceConfigurationRegistry.set} or
   * {@link InstanceConfigurationRegistry.setConfig}, `null` until a caller registers something.
   *
   * Plain data, no code — the ordinary way to configure, and the reason a configuration tree can be
   * written as JSON. Anything needing code goes through a setup function ({@link setupStates}).
   *
   * These stores hold **registered intent only** — the values an integrator asked for. The value an
   * instance ended up with lives on the instance itself, as `configState`, after defaults, construction
   * arguments, the setup function and the server's restrictions have all been applied. Reading a
   * declarative store answers "what was asked for", never "what is in effect".
   *
   * Entries appear on first access through {@link getConfigState}, matching `setupStates`.
   */
  private configStates = new Map<string, AnyConfigStore>();

  /**
   * The instances currently alive that derive configuration from each key — a `Channel` under
   * `'channel'`, a `MessageComposer` under `'messageComposer'`, and so on. `applyInstanceConfiguration`
   * adds an entry when an instance is constructed, and the callback returned by
   * {@link registerInstance} removes the entry when that instance is disposed of. Liveness is the whole
   * point of the map: a disposed instance must neither be re-derived nor counted.
   *
   * A single instance appears under several keys, because registration also covers every key named in
   * `alsoWatch` — a `Channel` is registered under `'channel'`, `'messagePaginator'` and
   * `'messageOperations'`. {@link reset} de-duplicates across keys so that one reset re-derives each
   * instance once rather than once per key.
   *
   * Two features read the map. {@link reset} walks the registered instances and makes each one re-derive,
   * once both configuration slots are cleared. {@link hasLiveInstances} answers the narrower question
   * "have instances already been built for this key?", which is what separates a construction-only path
   * registered too late — worth a warning, because already-built instances will never see the value — from
   * the same path registered before construction, where the value applies normally.
   */
  private liveInstances = new Map<string, Set<ConfiguredInstance>>();

  /**
   * The setup-function store for a key, created on first access. Lazy creation is a correctness
   * requirement rather than an optimization: for a key the SDK does not define, neither the setter nor
   * the subscriber can be assumed to come first.
   */
  getSetupState<K extends InstanceSetupKey>(key: K): StateStore<InstanceSetupState<K>> {
    let store = this.setupStates.get(key);
    if (!store) {
      store = new StateStore<InstanceSetupState<InstanceSetupKey>>({
        setupFunction: null,
      });
      this.setupStates.set(key, store);
    }
    return store as unknown as StateStore<InstanceSetupState<K>>;
  }

  /** The declarative-configuration store for a key, created on first access. */
  getConfigState<K extends InstanceSetupKey>(key: K): StateStore<InstanceConfigState<K>> {
    let store = this.configStates.get(key);
    if (!store) {
      store = new StateStore<InstanceConfigState<InstanceSetupKey>>({ config: null });
      this.configStates.set(key, store);
    }
    return store as unknown as StateStore<InstanceConfigState<K>>;
  }

  // -------------------------------------------------------------------------
  // Tier 2 — setup functions
  // -------------------------------------------------------------------------

  /**
   * Registers the setup function for a key, replacing any previous one (whose teardown runs first) and
   * applying it to every live instance. Pass `null` to clear.
   */
  setSetupFunction<K extends InstanceSetupKey>(
    key: K,
    setupFunction: InstanceSetupFunction<K> | null,
  ): void {
    this.debugIfKeyLooksUnused(key);
    this.getSetupState(key).partialNext({ setupFunction });
  }

  getSetupFunction<K extends InstanceSetupKey>(key: K): InstanceSetupFunction<K> | null {
    return this.getSetupState(key).getLatestValue().setupFunction;
  }

  // -------------------------------------------------------------------------
  // Tier 1 — declarative configuration
  // -------------------------------------------------------------------------

  /**
   * Registers declarative configuration for several keys at once. Deep-merges into whatever is already
   * registered, so a later call only affects the paths it names.
   */
  set(tree: DeepPartial<InstanceConfigTree>): void {
    for (const [key, subtree] of Object.entries(tree)) {
      // Skip absent entries but keep going — one empty or unrecognized entry must never discard the
      // rest of the tree.
      if (subtree === undefined || subtree === null) continue;
      this.setConfig(key, subtree as DeepPartial<InstanceConfigOf<string>>);
    }
  }

  /** Registers declarative configuration for one key, deep-merged into what is already there. */
  setConfig<K extends InstanceSetupKey>(
    key: K,
    config: DeepPartial<InstanceConfigOf<K>>,
  ): void {
    this.debugIfKeyLooksUnused(key);
    this.warnAboutLateConstructionOnlyPaths(key, config);

    const store = this.getConfigState(key);
    const current = store.getLatestValue().config;
    const next = mergeWith(
      { ...((current ?? {}) as Record<string, unknown>) },
      // Copied at the boundary. `mergeWith` reuses a source subtree verbatim where the target has nothing,
      // and on a first registration the target is empty — so without this the registry aliased the caller's
      // objects, and a later `patch.text.maxLengthOnSend = 5` changed resolved configuration behind every
      // live instance's back, with no notification. Functions and class instances pass through by reference,
      // which is what a caller hands over rather than a structure to merge into.
      copyConfigPatch(config) as unknown as object,
    ) as DeepPartial<InstanceConfigOf<K>>;

    store.partialNext({ config: next });
  }

  getConfig<K extends InstanceSetupKey>(key: K): DeepPartial<InstanceConfigOf<K>> | null {
    return this.getConfigState(key).getLatestValue().config;
  }

  /**
   * Everything currently registered, as one tree.
   *
   * Built for the case `getConfig(key)` cannot serve: enumerating what has been configured without
   * knowing the keys up front — a settings UI, a diagnostic dump, or a test asserting that every
   * configurable thing has a place in the tree.
   *
   * Includes custom keys alongside the built-in ones, since both are equally real. Keys with nothing
   * registered are omitted rather than emitted as `{}`, so an empty result means "nothing configured"
   * instead of "five empty subtrees". This is *registered intent*, not resolved values — for those, read
   * the instance's `config`.
   */
  getTree(): DeepPartial<InstanceConfigTree> & Record<string, unknown> {
    const tree: Record<string, unknown> = {};

    for (const key of this.configStates.keys()) {
      const config = this.getConfigState(key).getLatestValue().config;
      if (config && Object.keys(config).length > 0) tree[key] = config;
    }

    return tree as DeepPartial<InstanceConfigTree> & Record<string, unknown>;
  }

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  /**
   * Returns the given key — or every key that has been touched — to its baseline: clears the
   * declarative configuration, clears the setup function (running its teardown), then has every live
   * instance re-derive its configuration from current inputs.
   *
   * Re-derivation, rather than restoring a saved copy, is what makes this recover a known state even
   * when a setup function's teardown was incomplete; teardowns are integrator-written. It also
   * re-installs constructor-set behaviour (a `PinnedMessagePaginator`'s `doRequest` and comparators)
   * that no snapshot of configuration values could have restored.
   *
   * This does **not** undo setup-function changes made *outside* the configuration surface — inserted
   * middleware, added subscriptions. The contract is that configuration returns to its derived
   * baseline, not that the object returns to factory state.
   */
  reset(key?: InstanceSetupKey): void {
    const keys =
      key === undefined
        ? new Set([
            ...this.configStates.keys(),
            ...this.setupStates.keys(),
            ...this.liveInstances.keys(),
          ])
        : new Set<string>([key]);

    this.resetting = true;
    try {
      for (const currentKey of keys) {
        this.getConfigState(currentKey).partialNext({ config: null });
        // Clearing the setup function runs its teardown through the subscription in
        // `applyInstanceConfiguration`. Teardown first, re-derivation last, so a buggy teardown cannot
        // undo the re-derivation.
        this.getSetupState(currentKey).partialNext({ setupFunction: null });
      }
    } finally {
      this.resetting = false;
    }

    // Every slot is cleared before anything re-derives, and each instance runs **once** even when it is
    // registered under several keys — a `Channel` is registered under `channel`, `messagePaginator` and
    // `messageOperations`.
    //
    // Both halves of that need {@link isResetting}. Without it the loop above re-derives an instance as
    // each key is cleared, so it derives against a *half-cleared* tree — the opposite of "every slot is
    // cleared first" — and once per populated key rather than once in total.
    const instancesToReinitialize = new Set<ConfiguredInstance>();
    for (const currentKey of keys) {
      for (const instance of this.liveInstances.get(currentKey) ?? []) {
        instancesToReinitialize.add(instance);
      }
    }

    for (const instance of instancesToReinitialize) {
      try {
        instance.reinitializeConfig?.();
      } catch (error) {
        logger.error('reinitializeConfig threw during reset', error);
      }
    }
  }

  private resetting = false;

  /**
   * Whether {@link reset} is currently clearing slots.
   *
   * `applyInstanceConfiguration` reads it to skip the per-key notifications the clearing loop emits: an
   * instance that supplied a `reinitializeConfig` is guaranteed exactly one re-derivation in reset's final
   * phase, so reacting to each individual clear would only re-derive it repeatedly, and against a tree
   * that is not finished being cleared. Teardown is *not* skipped — it lives in the helper's closure and
   * has no other route.
   *
   * @internal
   */
  get isResetting(): boolean {
    return this.resetting;
  }

  // -------------------------------------------------------------------------
  // Consumer registry
  // -------------------------------------------------------------------------

  /**
   * Called by `applyInstanceConfiguration`. Returns the deregistration function.
   *
   * @internal
   */
  registerInstance(key: InstanceSetupKey, instance: ConfiguredInstance): () => void {
    let set = this.liveInstances.get(key);
    if (!set) {
      set = new Set();
      this.liveInstances.set(key, set);
    }
    set.add(instance);

    return () => {
      const current = this.liveInstances.get(key);
      if (!current) return;
      current.delete(instance);
      if (current.size === 0) this.liveInstances.delete(key);
    };
  }

  /** @internal */
  hasLiveInstances(key: InstanceSetupKey): boolean {
    return (this.liveInstances.get(key)?.size ?? 0) > 0;
  }

  // -------------------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------------------

  /**
   * An open key space means a typo — `'cahnnel'` — is a valid custom key that silently does nothing.
   * It cannot be rejected without breaking extensibility, and a warning would fire on the legitimate
   * "register before the instance subscribes" ordering, so the message stays at debug level.
   */
  private debugIfKeyLooksUnused(key: InstanceSetupKey): void {
    if ((BUILT_IN_INSTANCE_KEYS as readonly string[]).includes(key)) return;
    if (this.hasLiveInstances(key)) return;
    logger
      .withExtraTags(key)
      .debug(
        'Configuration registered for a key that is not built in and has no subscriber yet. This is ' +
          'expected if the owning class subscribes later; otherwise check the key spelling.',
      );
  }

  /**
   * Paths read once during construction cannot take effect on instances that already exist. That is
   * precisely detectable, so it warns — the one `warn` in this API, because unlike the debug-level
   * diagnostics it fires only when configuration genuinely did not apply.
   *
   * Only paths whose value actually **moves** warn. Re-registering a value identical to the one already
   * stored changes nothing, so there is nothing that failed to apply and nothing to report — and without
   * this, a settings UI that applies on every keystroke, or any `set()` on a render path, produced one
   * warning per call about a value that had not changed. Measured before the guard: 100 identical
   * `setConfig` calls, 100 warnings.
   */
  private warnAboutLateConstructionOnlyPaths(
    key: InstanceSetupKey,
    config: DeepPartial<InstanceConfigOf<InstanceSetupKey>>,
  ): void {
    if (!this.hasLiveInstances(key)) return; // nothing constructed yet — these will apply

    const paths = CONSTRUCTION_ONLY_CONFIG_PATHS[key];
    if (!paths || !isWalkableRecord(config)) return;

    const current = this.getConfigState(key).getLatestValue().config;
    const registered = isWalkableRecord(current) ? current : undefined;

    const late = paths.filter((path) => {
      if (!hasPath(config, path)) return false;
      // Compared against what is registered rather than what the instance resolved to: this diagnostic is
      // about a *registration* arriving too late, and the instance's own value may legitimately differ
      // (a setup function or the server may have moved it).
      if (!registered || !hasPath(registered, path)) return true;
      return !isEqual(getPath(registered, path), getPath(config, path));
    });
    if (late.length === 0) return;

    logger
      .withExtraTags(key)
      .warn(
        `These paths are read once during construction, so they will not affect the ${key} ` +
          `instance(s) that already exist: ${late.join(', ')}. Register configuration before the ` +
          'instances are created — typically alongside StreamChat.getInstance().',
      );
  }
}
