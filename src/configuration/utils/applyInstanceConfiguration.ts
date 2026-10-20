import { chatLoggerSystem } from '../../logger';
import type {
  ConfiguredInstance,
  InstanceConfigurationRegistry,
} from '../InstanceConfigurationRegistry';
import type {
  InstanceConfigKey,
  InstanceConfigOf,
  InstanceSetupFunctionArgsOf,
  InstanceSetupKey,
  InstanceSetupTearDownFunction,
} from '../types';
import type { DeepPartial } from '../../types.utility';
import type { Unsubscribe } from '@stream-io/state-store';

const logger = chatLoggerSystem.getLogger('instance-configuration');

/** @internal */
export type ApplyInstanceConfigurationParams<K extends InstanceSetupKey> = {
  /** The instance's argument for its setup function, such as `{ channel }`. */
  args: InstanceSetupFunctionArgsOf<K>;
  config: InstanceConfigurationRegistry;
  key: K;
  /**
   * Other keys this instance derives from (`Channel` and `Thread` read `messagePaginator` and
   * `messageOperations`). A change there re-runs the whole cycle, so the setup function is re-applied
   * over the new values. The instance is also registered as live under each.
   */
  alsoWatch?: readonly InstanceConfigKey[];
  /**
   * Applies the declarative slice to the instance. Omit it if the instance only wants the setup function.
   * Called on every cycle, with `undefined` when the key has no configuration, since the instance may
   * derive from other inputs too.
   */
  applyConfig?: (config?: DeepPartial<InstanceConfigOf<K>>) => void;
  /**
   * The instance's `initializeConfig`, bound. `reset` calls it after clearing both slots. Without it,
   * reset only clears registrations.
   */
  reinitializeConfig?: () => void;
};

/**
 * Subscribes one instance to the configuration registered for its key and returns the unsubscribe.
 * Applies what is registered immediately, then on every change: declarative configuration first and the
 * setup function second (so it wins), running the previous teardown before each re-apply and on
 * unsubscribe. A throwing setup function, teardown or applier is logged, never propagated.
 *
 * @internal
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

  // One handle for every key: `reset` de-duplicates by identity, so the instance re-derives once.
  const instanceHandle: ConfiguredInstance = { reinitializeConfig };

  const unregisterInstance = service.registerInstance(key, instanceHandle);

  // `subscribe` fires immediately: suppress while wiring, then apply once.
  let suppress = true;

  // An instance with `reinitializeConfig` is re-derived once by reset's final pass, so it ignores the
  // per-key clears, which fire synchronously against a half-cleared tree.
  const coveredByResetsOwnPass = () => !!reinitializeConfig && service.isResetting;

  const onConfigChange = () => {
    if (suppress || coveredByResetsOwnPass()) return;
    apply();
  };

  const onSetupChange = () => {
    if (suppress) return;
    // Teardown lives in this closure, out of reset's reach: run it here, leave re-derivation to reset.
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
  // Selector-based so a publish that leaves `config` unchanged (`reset` clearing an empty slot) does
  // not trigger a cycle.
  const unsubscribeExtra = (alsoWatch ?? []).map((watchedKey) =>
    service
      .getConfigState(watchedKey)
      .subscribeWithSelector(({ config }) => ({ config }), onConfigChange),
  );
  // Registered under the watched keys too, so `hasLiveInstances` is true for them.
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
