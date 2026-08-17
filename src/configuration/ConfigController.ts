import { StateStore } from '../store';
import { mergeWith } from '../utils/mergeWith';
import { isEqual } from '../utils/mergeWith/mergeWithCore';
import { copyConfigPatch } from './copyConfigPatch';
import { deepFreezeConfig } from './deepFreezeConfig';

export type ConfigControllerOptions<TConfig extends Record<string, unknown>> = {
  /**
   * Package defaults. Deep-frozen on construction, so a nested write through the entity's public
   * `config` getter throws instead of silently changing the default for every instance in the process —
   * a bug found three times in three entities before this was centralized.
   */
  defaults: TConfig;
  /**
   * Defaults the SDK itself supplies for this instance — a subclass's, or an owner's for the object it
   * builds. Layered above {@link ConfigControllerOptions.defaults} and **below** the declarative slice.
   *
   * The distinction is the whole reason this exists. These arrive through the same constructor as an
   * integrator's arguments, so before they were separated a paginator built with no configuration at all
   * already carried `pageSize`, `stateThrottleMs`, `initialCursor` and `hasPaginationQueryShapeChanged`
   * as "construction arguments" — which meant the documented order could not be applied to it without
   * those SDK values beating every `client.config.set()`.
   */
  builtInDefaults?: Partial<TConfig>;
  /**
   * Arguments the **integrator** passed to the constructor. Stage 3 of
   * `docs/instance-configuration.md` §3, so they outrank the declarative tree, and they survive a reset —
   * unlike the slice. Only what a caller actually supplied belongs here; anything the SDK injects on its
   * own behalf goes in {@link ConfigControllerOptions.builtInDefaults}.
   */
  constructorOptions?: Partial<TConfig>;
  /**
   * The declarative slice known at construction, used only to seed the store.
   *
   * Separate from calling {@link ConfigController.initialize} afterwards, because that would run
   * `getBehaviourOverrides` — an override on the owning class — while the owner's own constructor is
   * still in flight, memoizing closures over half-initialized fields.
   */
  initialSlice?: Partial<TConfig>;
  /**
   * How the declarative slice combines with the layers beneath it. `'shallow'` (the default) suits a flat
   * config; `'deep'` is for one with nested groups, where naming one member must not drop its siblings.
   * Declared rather than implied, because reading `updateConfig(config: Partial<T>)` never told you which
   * you were getting.
   */
  mergeSlice?: 'shallow' | 'deep';
  /**
   * Fields that outrank every layer — behaviour no option can express, such as a comparator or a request
   * function closed over the entity. Folded into the single derivation, so one re-derivation is one
   * publish carrying a complete config.
   *
   * Must return **stable references**: rebuilding the closures per call makes every derived config differ
   * from the last, which defeats the no-op guard and republishes on every unrelated re-derivation.
   */
  getBehaviourOverrides?: () => Partial<TConfig>;
  /**
   * Runs after a change lands, with the value it replaced.
   *
   * This is where read-once fields are re-applied. It exists because "store the value" and "make the
   * value take effect" were separate steps that each entity had to remember to pair: a paginator's
   * `updateConfig({ debounceMs })` stored 900 and left the debounce running at 300, so resolved
   * configuration reported a value the entity was not using. Routing every write through one place means
   * the pairing cannot be forgotten.
   *
   * Not called for the initial value — there is no previous state to compare, and construction is where
   * the entity sets these up itself.
   */
  onChanged?: (next: Readonly<TConfig>, previous: Readonly<TConfig>) => void;
  /**
   * Whether a {@link ConfigController.patch} survives the next derivation.
   *
   * Off by default: a patch is written into the resolved value, and the next derivation — which rebuilds
   * from defaults and registrations — replaces it. On, each patch is kept as an input and replayed every
   * time, so the request outlives anything else re-resolving.
   *
   * `MessageComposer` is the one entity that needs this on, because it is the one a server can narrow: a
   * stored `false` cannot say whether the client or the server turned a feature off, so re-applying
   * restrictions either makes the server's answer permanent or wipes the client's (**DV-18**). Retaining
   * the request makes the resolution idempotent instead. **FU-35** is the question of which other
   * entities should switch it on.
   */
  retainPatches?: boolean;
  /**
   * The final transform, applied to the request to produce what is published — the composer's server
   * restrictions and upper bounds.
   *
   * Kept as one opaque hook so the controller never learns the authority rules themselves; those live in
   * `serverAuthority.ts`. Runs on *every* derivation, which is the point: a restriction applied only at
   * construction stops holding the first time anything else updates the configuration.
   */
  applyAuthority?: (requested: TConfig) => TConfig;
};

/**
 * Lays one layer over another, ignoring keys whose value is `undefined`.
 *
 * Not a plain spread, because `Partial<T>` admits an explicit `undefined` and a spread would write it —
 * turning "I did not set this" into "I set this to nothing" and wiping the default underneath. The
 * declarative merge helpers draw the same line.
 */
const layer = <T extends object>(target: T, source?: Partial<T>): T => {
  if (!source) return target;
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    (target as Record<string, unknown>)[key] = value;
  }
  return target;
};

/**
 * The configuration machinery every configurable entity needs, as an object they own rather than a base
 * class they extend — `MessageComposer`, `Thread`, `ReminderManager`, `ThreadManager` and
 * `LiveLocationManager` already extend `WithSubscriptions`, and `Channel` extends `ChannelApi`, so single
 * inheritance is spent.
 *
 * It owns the four things that were previously re-implemented per entity and got wrong
 * independently: freezing the defaults, deriving in a fixed layer order, skipping a write that changes
 * nothing, and re-applying read-once fields after a change.
 *
 * **Public, so a class registered under a custom key gets the same behaviour as a built-in one.**
 * `applyInstanceConfiguration` subscribes such a class to its key; this is what resolves the value once
 * the slice arrives. Without it, an outside class would hand-roll the derivation and be free to
 * reintroduce every bug this consolidated — leaking a shared default, publishing when nothing moved,
 * storing a read-once field without applying it.
 *
 * The entity keeps the shape every configurable class exposes by forwarding:
 *
 * ```ts
 * class MyWidget {
 *   private readonly configController = new ConfigController<MyWidgetConfig>({
 *     defaults: DEFAULT_MY_WIDGET_CONFIG,
 *     onChanged: (next, previous) => {
 *       if (next.pollIntervalMs !== previous.pollIntervalMs) this.restartPolling();
 *     },
 *   });
 *
 *   get configState() { return this.configController.state; }
 *   get config() { return this.configController.value; }
 *   updateConfig(patch: Partial<MyWidgetConfig>) { this.configController.patch(patch); }
 *   initializeConfig(slice?: Partial<MyWidgetConfig>) { this.configController.initialize(slice); }
 * }
 * ```
 */
export class ConfigController<
  TConfig extends Record<string, unknown>,
  TSlice = Partial<TConfig>,
> {
  readonly state: StateStore<TConfig>;
  private readonly options: ConfigControllerOptions<TConfig>;
  /** Retained `patch` calls, under `retainPatches`. Cleared by {@link initialize}. */
  private patchLayer: Partial<TConfig> = {};
  /** The slice last derived from, so {@link rederive} can re-run without being handed it again. */
  private slice?: Partial<TConfig>;

  constructor(options: ConfigControllerOptions<TConfig>) {
    deepFreezeConfig(options.defaults);
    this.options = {
      ...options,
      // Copied at the boundary, like a patch: these are read on every derivation for the entity's whole
      // life, so holding the caller's object would let a later mutation of it change resolved
      // configuration with no notification.
      constructorOptions:
        options.constructorOptions && copyConfigPatch(options.constructorOptions),
    };
    this.slice = options.initialSlice;
    // Seeded without `getBehaviourOverrides`: the hook is an override on the owning class, and running it
    // here would call into a subclass before its own fields are initialized. Entities install their
    // behaviour from their constructor, once they are whole. The authority hook *does* run — a value
    // published before the server has had its say would be wrong from the first read.
    this.state = new StateStore<TConfig>(this.resolve({ withBehaviourOverrides: false }));
  }

  /** What was asked for, before {@link ConfigControllerOptions.applyAuthority} has its say. */
  get requested(): Readonly<TConfig> {
    return this.resolve({ withBehaviourOverrides: true, skipAuthority: true });
  }

  get value(): Readonly<TConfig> {
    return this.state.getLatestValue();
  }

  /**
   * Rebuilds from the real inputs — defaults, constructor options, the slice, then behaviour overrides —
   * and publishes once, or not at all when nothing moved. Applied in that order, so the slice may narrow
   * a constructor option and behaviour overrides outrank both.
   */
  initialize(slice?: TSlice): void {
    this.patchLayer = {};
    this.slice = slice as Partial<TConfig> | undefined;
    this.write(this.resolve({ withBehaviourOverrides: true }));
  }

  /**
   * Re-runs the derivation **keeping** retained patches — for when an input the entity does not own has
   * moved, such as the server's answer arriving. Without `retainPatches` there is nothing to keep, so
   * this is the same as {@link initialize}.
   */
  rederive(slice?: TSlice): void {
    this.slice = slice as Partial<TConfig> | undefined;
    this.write(this.resolve({ withBehaviourOverrides: true }));
  }

  /**
   * Applies a partial configuration, skipping the write when every field already matches.
   *
   * Copied on the way in, because `mergeWith` reuses a source subtree verbatim where the target has
   * nothing — so without this the entity would hold the caller's object, and a later mutation of it would
   * change resolved configuration with no notification.
   */
  patch(patch: Partial<TConfig>): void {
    const owned = copyConfigPatch(patch);
    if (!this.options.retainPatches) {
      // A plain spread, deliberately: an explicit `undefined` has to be able to clear a field, which is
      // how a paginator's state throttle is switched off.
      this.write({ ...this.value, ...owned } as TConfig);
      return;
    }
    this.patchLayer = mergeWith(
      this.patchLayer as object,
      owned as object,
    ) as Partial<TConfig>;
    this.write(this.resolve({ withBehaviourOverrides: true }));
  }

  /**
   * The layers beneath the patch layer, in `docs/instance-configuration.md` §3 order: package defaults,
   * then the SDK's own defaults for this instance, then the declarative tree (stage 2), then the
   * integrator's construction arguments (stage 3).
   *
   * One order for every entity. `BasePaginator` used to layer the last two the other way round while
   * `MessageComposer` followed the doc, so the same registration answered differently depending on which
   * object read it. Aligning them required separating {@link ConfigControllerOptions.builtInDefaults}
   * from {@link ConfigControllerOptions.constructorOptions} first — the order was never the problem, the
   * contents of that layer were.
   */
  private orderedLayers(): (Partial<TConfig> | undefined)[] {
    const { builtInDefaults, constructorOptions } = this.options;
    return [builtInDefaults, this.slice, constructorOptions, this.patchLayer];
  }

  private resolve({
    skipAuthority,
    withBehaviourOverrides,
  }: {
    withBehaviourOverrides: boolean;
    skipAuthority?: boolean;
  }): TConfig {
    const { applyAuthority, defaults, getBehaviourOverrides, mergeSlice } = this.options;
    const layers = this.orderedLayers();

    // Seeded with a shallow spread on both paths. A subtree no layer touches stays identical to the
    // frozen module default, which is safe *because* it is frozen — and cheap, which matters on the
    // composer's publish path. `mergeWith` copies any subtree a layer does touch, and never writes into
    // its target.
    let requested =
      mergeSlice === 'deep'
        ? (layers.reduce<object>(
            (resolved, next) => mergeWith(resolved, (next ?? {}) as object),
            { ...defaults } as object,
          ) as TConfig)
        : (layers.reduce<TConfig>((resolved, next) => layer(resolved, next), {
            ...defaults,
          } as TConfig) as TConfig);

    if (withBehaviourOverrides) {
      requested = { ...requested, ...(getBehaviourOverrides?.() ?? {}) } as TConfig;
    }
    if (skipAuthority || !applyAuthority) return requested;
    return applyAuthority(requested);
  }

  private write(next: TConfig): void {
    const previous = this.value;
    if (isEqual(previous, next)) return;
    this.state.next(next);
    this.options.onChanged?.(next, previous);
  }
}
