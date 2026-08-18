import { chatLoggerSystem } from '../../logger';
import type {
  ConfiguredInstance,
  InstanceConfigurationRegistry,
} from '../InstanceConfigurationRegistry';
import type {
  InstanceConfigOf,
  InstanceSetupFunctionArgsOf,
  InstanceSetupKey,
  InstanceSetupTearDownFunction,
} from '../types';
import type { DeepPartial } from '../../types.utility';
import type { Unsubscribe } from '../../store';

const logger = chatLoggerSystem.getLogger('instance-configuration');

export type ApplyInstanceConfigurationParams<K extends InstanceSetupKey> = {
  /** The instance's argument for its setup function — `{ channel }`, `{ composer }`, and so on. */
  args: InstanceSetupFunctionArgsOf<K>;
  /** The client's configuration registry, i.e. `client.config`. */
  config: InstanceConfigurationRegistry;
  key: K;
  /**
   * Other keys this instance derives from. `Channel` and `Thread` both read the shared `messagePaginator`
   * and `messageOperations` keys, so a change there has to re-run this instance's own cycle rather than
   * only re-deriving: re-deriving alone would drop the setup function's overrides, since tier 2 is
   * applied after tier 1.
   *
   * Keys rather than stores, which buys two things beyond brevity. The instance is registered as a
   * live instance of each, so `hasLiveInstances` is true for a shared key and its construction-only paths get
   * same late-registration warning the per-parent slices already got. And there is no longer a structural
   * store type needed to work around `StateStore`'s invariance.
   */
  alsoWatch?: readonly InstanceSetupKey[];
  /**
   * Applies a declarative configuration slice to the instance. Omit it if the instance has no
   * declarative surface and only wants the setup function.
   *
   * Called on every cycle, **including when this key has no configuration of its own** — an instance may
   * derive from other inputs too (`alsoWatch`, or the server), so it has to be told to re-derive rather
   * than being skipped. Hence the optional argument.
   */
  applyConfig?: (config?: DeepPartial<InstanceConfigOf<K>>) => void;
  /**
   * The instance's own `initializeConfig`, bound. Invoked by `config.reset()` after both slots are
   * cleared, so the instance re-derives its configuration from current inputs. Omit it to get
   * clear-registrations-only reset semantics.
   */
  reinitializeConfig?: () => void;
};

/**
 * Subscribes one instance to the configuration registered for its key, and returns the unsubscribe.
 *
 * This is the single place the *subscription* semantics live, so every configured instance behaves
 * identically — including one written outside this package for a custom key. Pair it with a
 * `ConfigController`, which is the single place the *resolution* semantics live; between them an outside
 * class gets exactly what a built-in one gets:
 *
 * - applies whatever is already registered, immediately;
 * - re-applies on every change to either slot, declarative configuration first and the setup function
 *   second, so a setup function always wins for the same field;
 * - runs the previous setup function's teardown before re-applying, and again on unsubscribe;
 * - contains errors — a throwing setup function, teardown or applier is logged and never propagates,
 *   so it cannot break `client.channel()` or a `Thread` construction.
 *
 * @example
 * ```ts
 * class MyWidget {
 *   private unsubscribe = applyInstanceConfiguration({
 *     config: client.config,
 *     key: 'myWidget',
 *     args: { widget: this },
 *     applyConfig: (next) => Object.assign(this.config, next),
 *     reinitializeConfig: () => this.initializeConfig(),
 *   });
 * }
 * ```
 */
export const applyInstanceConfiguration = <K extends InstanceSetupKey>({
  alsoWatch,
  applyConfig,
  args,
  config: service,
  key,
  reinitializeConfig,
}: ApplyInstanceConfigurationParams<K>): Unsubscribe => {
  const scopedLogger = logger.withExtraTags(key);
  let tearDown: InstanceSetupTearDownFunction | null = null;

  const runTearDown = () => {
    if (!tearDown) return;
    const pending = tearDown;
    // Cleared before invoking, so a throwing teardown is never retried.
    tearDown = null;
    try {
      pending();
    } catch (error) {
      scopedLogger.error('Setup function teardown threw', error);
    }
  };

  const apply = () => {
    runTearDown();

    if (applyConfig) {
      const declarative = service.getConfigState(key).getLatestValue().config;
      try {
        applyConfig(declarative ?? undefined);
      } catch (error) {
        scopedLogger.error('Applying declarative configuration threw', error);
      }
    }

    const setupFunction = service.getSetupState(key).getLatestValue().setupFunction;
    if (setupFunction) {
      try {
        tearDown = setupFunction(args) ?? null;
      } catch (error) {
        scopedLogger.error('Setup function threw', error);
      }
    }
  };

  // One handle, shared by every key this instance registers under. `reset` de-duplicates by object
  // identity, so a handle allocated per key would defeat it — a `Channel` registered under `channel`,
  // `messagePaginator` and `messageOperations` would re-derive three times for one reset.
  const instanceHandle: ConfiguredInstance = { reinitializeConfig };

  const unregisterInstance = service.registerInstance(key, instanceHandle);

  // `StateStore.subscribe` fires immediately, and we subscribe to two stores — so suppress while
  // wiring and apply exactly once afterwards.
  let suppress = true;

  // `reset` clears every slot and *then* re-derives each live instance exactly once. An instance that
  // supplied a `reinitializeConfig` is therefore covered already, so reacting to the individual clears
  // would re-derive it once per populated key — and against a tree still half-cleared, since the
  // notifications fire synchronously inside reset's loop. An instance without one has no other route, so
  // it keeps reacting.
  const coveredByResetsOwnPass = () => !!reinitializeConfig && service.isResetting;

  const onConfigChange = () => {
    if (suppress || coveredByResetsOwnPass()) return;
    apply();
  };

  const onSetupChange = () => {
    if (suppress) return;
    // Teardown is not reset's to run: it lives in this closure, so `reinitializeConfig` cannot reach it.
    // Run it here and leave the re-derivation to reset's final phase.
    if (coveredByResetsOwnPass()) {
      runTearDown();
      return;
    }
    apply();
  };

  const unsubscribeConfig = service
    .getConfigState(key)
    .subscribeWithSelector(({ config }) => ({ config }), onConfigChange);
  const unsubscribeSetup = service
    .getSetupState(key)
    .subscribeWithSelector(({ setupFunction }) => ({ setupFunction }), onSetupChange);
  // Selector-based like the two above, so a store that publishes without its `config` moving — `reset`
  // clearing an already-empty slot does exactly that, since `partialNext` always allocates — does not
  // trigger a cycle.
  const unsubscribeExtra = (alsoWatch ?? []).map((watchedKey) =>
    service
      .getConfigState(watchedKey)
      .subscribeWithSelector(({ config }) => ({ config }), onConfigChange),
  );
  // Registering against the watched keys too is what makes `hasLiveInstances` true for them. The shared
  // `instanceHandle` is what lets `reset()` de-duplicate across keys, so being registered under several
  // does not multiply re-derives.
  const unregisterExtra = (alsoWatch ?? []).map((watchedKey) =>
    service.registerInstance(watchedKey, instanceHandle),
  );
  suppress = false;

  apply();

  return () => {
    unsubscribeConfig();
    unsubscribeSetup();
    unsubscribeExtra.forEach((unsubscribe) => unsubscribe());
    unregisterExtra.forEach((unregister) => unregister());
    unregisterInstance();
    runTearDown();
  };
};
