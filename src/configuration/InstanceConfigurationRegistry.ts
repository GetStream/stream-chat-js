/**
 * Holds the configuration an integrator registers for classes the SDK constructs (`Channel`, `Thread`,
 * `MessageComposer`, the client's managers). Reached as `client.config`, one per client. Not to be
 * confused with `client.channelServerConfigs` (server-provided channel configs).
 *
 * Two ways in: `set(tree)` / `setConfig(key, subtree)` register values, and `setSetupFunction(key, fn)`
 * is the escape hatch for behaviour a value cannot express. Declarative configuration applies first, so
 * a setup function wins for the same field.
 *
 * The key space is closed by the types. Stores are created lazily, since a setter and a subscriber for
 * a key can arrive in either order.
 */

import { StateStore } from '@stream-io/state-store';
import { chatLoggerSystem } from '../logger';
import { mergeWith } from '../utils/mergeWith';
import { isEqual } from '../utils/mergeWith/mergeWithCore';
import { copyConfigPatch } from './utils/copyConfigPatch';
import { getPath, hasPath, isWalkableRecord } from '../utils/objectPath';
import { CONSTRUCTION_ONLY_CONFIG_PATHS, INSTANCE_CONFIG_TREE_KEYS } from './keys';
import type {
  InstanceConfigKey,
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
 * A live instance registered by `applyInstanceConfiguration`, so `reset` can reach it and the registry
 * can tell whether a key has any live instance.
 *
 * @internal
 */
export type ConfiguredInstance = {
  /** The instance's `initializeConfig`, bound. Invoked by `reset` after both slots are cleared. */
  reinitializeConfig?: () => void;
};

// Keyed by plain string, so value types cannot be tied to the key here. Callers narrow through
// `getSetupState` / `getConfigState`.
type AnySetupStore = StateStore<InstanceSetupState<InstanceSetupKey>>;
type AnyConfigStore = StateStore<InstanceConfigState<InstanceConfigKey>>;

export class InstanceConfigurationRegistry {
  /**
   * Setup function per key, each in a store so that instances built before or after a registration both
   * see it. Applied after declarative configuration, so it wins for the same field.
   */
  private setupStates = new Map<string, AnySetupStore>();

  /**
   * Registered declarative values per key (`null` until set). Registered intent only: the value in
   * effect is the instance's own `configState`.
   */
  private configStates = new Map<string, AnyConfigStore>();

  /**
   * Live instances per key. One instance sits under several keys when it passes `alsoWatch`, and `reset`
   * de-duplicates across them.
   */
  private liveInstances = new Map<string, Set<ConfiguredInstance>>();

  /** The setup-function store for a key, created on first access. */
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
  getConfigState<K extends InstanceConfigKey>(
    key: K,
  ): StateStore<InstanceConfigState<K>> {
    let store = this.configStates.get(key);
    if (!store) {
      store = new StateStore<InstanceConfigState<InstanceConfigKey>>({ config: null });
      this.configStates.set(key, store);
    }
    return store as unknown as StateStore<InstanceConfigState<K>>;
  }

  /**
   * Registers the setup function for a key, replacing any previous one (whose teardown runs first) and
   * applying it to every live instance. Pass `null` to clear.
   */
  setSetupFunction<K extends InstanceSetupKey>(
    key: K,
    setupFunction: InstanceSetupFunction<K> | null,
  ): void {
    this.warnIfKeyLooksUnknown(key);
    this.getSetupState(key).partialNext({ setupFunction });
  }

  getSetupFunction<K extends InstanceSetupKey>(key: K): InstanceSetupFunction<K> | null {
    return this.getSetupState(key).getLatestValue().setupFunction;
  }

  /**
   * Registers declarative configuration for several keys at once. Deep-merges into whatever is already
   * registered, so a later call only affects the paths it names.
   */
  set(tree: DeepPartial<InstanceConfigTree>): void {
    for (const [key, subtree] of Object.entries(tree)) {
      if (subtree === undefined || subtree === null) continue;
      this.setConfig(
        key as InstanceConfigKey,
        subtree as DeepPartial<InstanceConfigOf<InstanceConfigKey>>,
      );
    }
  }

  /** Registers declarative configuration for one key, deep-merged into what is already there. */
  setConfig<K extends InstanceConfigKey>(
    key: K,
    config: DeepPartial<InstanceConfigOf<K>>,
  ): void {
    this.warnIfKeyLooksUnknown(key);
    this.warnAboutLateConstructionOnlyPaths(key, config);

    const store = this.getConfigState(key);
    const current = store.getLatestValue().config;
    const next = mergeWith(
      { ...((current ?? {}) as Record<string, unknown>) },
      // Copied because `mergeWith` reuses source subtrees verbatim, which would alias the caller's
      // objects. Functions and class instances pass through by reference.
      copyConfigPatch(config) as unknown as object,
    ) as DeepPartial<InstanceConfigOf<K>>;

    store.partialNext({ config: next });
  }

  getConfig<K extends InstanceConfigKey>(
    key: K,
  ): DeepPartial<InstanceConfigOf<K>> | null {
    return this.getConfigState(key).getLatestValue().config;
  }

  /**
   * Everything currently registered, as one tree. Keys with nothing registered are omitted. This is
   * registered intent, not resolved values: for those, read the instance's `config`.
   */
  getTree(): DeepPartial<InstanceConfigTree> {
    const tree: Record<string, unknown> = {};

    for (const key of this.configStates.keys() as Iterable<InstanceConfigKey>) {
      const config = this.getConfigState(key).getLatestValue().config;
      if (config && Object.keys(config).length > 0) tree[key] = config;
    }

    return tree as DeepPartial<InstanceConfigTree>;
  }

  /**
   * Returns the key (or every touched key) to its baseline: clears declarative configuration and the
   * setup function (running its teardown), then has every live instance re-derive its configuration.
   *
   * Does not undo what a setup function changed outside the configuration surface (inserted
   * middleware, added subscriptions).
   */
  reset(key?: InstanceConfigKey): void {
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
        this.getConfigState(currentKey as InstanceConfigKey).partialNext({
          config: null,
        });
        // Teardown runs through the subscription in `applyInstanceConfiguration`, before re-derivation.
        // Read, not created: a configuration-only key such as `messagePaginator` has no setup function.
        this.setupStates.get(currentKey)?.partialNext({ setupFunction: null });
      }
    } finally {
      this.resetting = false;
    }

    // Every slot is cleared before anything re-derives, and each instance re-derives once even when it
    // is registered under several keys. `isResetting` keeps the clearing loop from re-deriving early.
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
   * Whether {@link reset} is clearing slots. `applyInstanceConfiguration` uses it to skip the per-key
   * notifications for instances that reset re-derives itself.
   *
   * @internal
   */
  get isResetting(): boolean {
    return this.resetting;
  }

  /**
   * Called by `applyInstanceConfiguration`. Returns the deregistration function.
   *
   * @internal
   */
  registerInstance(key: InstanceConfigKey, instance: ConfiguredInstance): () => void {
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
  hasLiveInstances(key: InstanceConfigKey): boolean {
    return (this.liveInstances.get(key)?.size ?? 0) > 0;
  }

  /**
   * Warns, rather than throws, when a JavaScript caller (or a cast) registers a key nothing will read.
   * Quiet for a key whose owner is not constructed yet.
   */
  private warnIfKeyLooksUnknown(key: InstanceConfigKey): void {
    if ((INSTANCE_CONFIG_TREE_KEYS as readonly string[]).includes(key)) return;
    if (this.hasLiveInstances(key)) return;
    logger
      .withExtraTags(key)
      .warn(
        'Configuration registered for a key this package does not define, with nothing subscribed to ' +
          'it. Check the spelling; a key declared by a downstream SDK is expected here only if its ' +
          'owner subscribes later.',
      );
  }

  /**
   * Warns when paths read once during construction are registered after instances exist, since those
   * instances will not see them. Only paths whose registered value changes warn.
   */
  private warnAboutLateConstructionOnlyPaths(
    key: InstanceConfigKey,
    config: DeepPartial<InstanceConfigOf<InstanceSetupKey>>,
  ): void {
    if (!this.hasLiveInstances(key)) return; // nothing constructed yet: these will apply

    const paths = CONSTRUCTION_ONLY_CONFIG_PATHS[key];
    if (!paths || !isWalkableRecord(config)) return;

    const current = this.getConfigState(key).getLatestValue().config;
    const registered = isWalkableRecord(current) ? current : undefined;

    const late = paths.filter((path) => {
      if (!hasPath(config, path)) return false;
      // Compared against what is registered, not what the instance resolved to (which a setup function
      // or the server may have moved).
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
