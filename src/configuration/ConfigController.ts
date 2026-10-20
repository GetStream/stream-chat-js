import { StateStore } from '@stream-io/state-store';
import { mergeWith } from '../utils/mergeWith';
import { isEqual } from '../utils/mergeWith/mergeWithCore';
import { copyConfigPatch } from './utils/copyConfigPatch';
import { deepFreezeConfig } from './utils/deepFreezeConfig';

export type ConfigControllerOptions<TConfig extends Record<string, unknown>> = {
  /** Package defaults. Deep-frozen on construction, so a nested write through `config` throws. */
  defaults: TConfig;
  /** SDK-supplied defaults for this instance (a subclass's or an owner's), below the slice. */
  builtInDefaults?: Partial<TConfig>;
  /**
   * Arguments the integrator passed to the constructor. They outrank the slice and survive a reset.
   * SDK-injected values belong in `builtInDefaults`.
   */
  constructorOptions?: Partial<TConfig>;
  /**
   * The declarative slice known at construction, used only to seed the store. Calling `initialize`
   * instead would run `getBehaviourOverrides` while the owner's constructor is still in flight.
   */
  initialSlice?: Partial<TConfig>;
  /** How the slice combines with lower layers. `'deep'` keeps siblings of a named nested member. */
  mergeSlice?: 'shallow' | 'deep';
  /**
   * Fields that outrank every layer: behaviour no option can express (a comparator, a request function
   * closed over the entity). Must return stable references, or every re-derivation republishes.
   */
  getBehaviourOverrides?: () => Partial<TConfig>;
  /**
   * Runs after a change lands, with the value it replaced. Where read-once fields are re-applied. Not
   * called for the initial value.
   */
  onChanged?: (next: Readonly<TConfig>, previous: Readonly<TConfig>) => void;
  /**
   * Keeps each {@link ConfigController.patch} as an input replayed on every derivation. Off, a patch is
   * written into the current value and the next derivation replaces it.
   *
   * `MessageComposer` turns it on: a stored `false` cannot say whether the client or the server turned a
   * feature off. Off with `applyAuthority`, a request the server narrows is lost, not restored if the
   * server later relents.
   */
  retainPatches?: boolean;
  /** Final transform from the requested config to the published one, on every derivation and `patch`. */
  applyAuthority?: (requested: TConfig) => TConfig;
};

/** Lays `source` over `target`, skipping `undefined` values (a spread would wipe the default). */
const layer = <T extends object>(target: T, source?: Partial<T>): T => {
  if (!source) return target;
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    (target as Record<string, unknown>)[key] = value;
  }
  return target;
};

/**
 * Configuration machinery for a configurable entity, held as a field rather than inherited. It freezes
 * the defaults, derives in a fixed layer order (see `docs/instance-configuration.md` §3), skips a write
 * that changes nothing, and re-applies read-once fields through `onChanged`.
 *
 * Entities forward it as `configState` (`state`), `config` (`value`), `updateConfig` (`patch`) and
 * `initializeConfig` (`initialize`).
 *
 * @internal
 */
export class ConfigController<
  TConfig extends Record<string, unknown>,
  TSlice = Partial<TConfig>,
> {
  readonly state: StateStore<TConfig>;
  private readonly options: ConfigControllerOptions<TConfig>;
  /** Retained `patch` calls, under `retainPatches`. Cleared by {@link initialize}. */
  private patchLayer: Partial<TConfig> = {};
  /** The slice last derived from, so {@link rederive} can re-run without it. */
  private slice?: Partial<TConfig>;

  constructor(options: ConfigControllerOptions<TConfig>) {
    deepFreezeConfig(options.defaults);
    this.options = {
      ...options,
      // Copied so a later mutation by the caller cannot change resolved config unnoticed.
      constructorOptions:
        options.constructorOptions && copyConfigPatch(options.constructorOptions),
    };
    this.slice = options.initialSlice;
    // Seeded without `getBehaviourOverrides`: it is a hook on the owning class, which is not yet
    // initialized. Authority still applies.
    this.state = new StateStore<TConfig>(this.resolve({ withBehaviourOverrides: false }));
  }

  /** The configuration before {@link ConfigControllerOptions.applyAuthority} runs. */
  get requested(): Readonly<TConfig> {
    return this.resolve({ withBehaviourOverrides: true, skipAuthority: true });
  }

  get value(): Readonly<TConfig> {
    return this.state.getLatestValue();
  }

  /**
   * Drops retained patches and rebuilds from defaults, built-in defaults, the slice, constructor options
   * and behaviour overrides (later wins), publishing once, or not at all when nothing changed.
   */
  initialize(slice?: TSlice): void {
    this.patchLayer = {};
    this.slice = slice as Partial<TConfig> | undefined;
    this.write(this.resolve({ withBehaviourOverrides: true }));
  }

  /** Like {@link initialize} but keeps retained patches, for when an outside input changes. */
  rederive(slice?: TSlice): void {
    this.slice = slice as Partial<TConfig> | undefined;
    this.write(this.resolve({ withBehaviourOverrides: true }));
  }

  /** Applies a partial configuration, skipping the write when every field already matches. */
  patch(patch: Partial<TConfig>): void {
    // Copied so a later mutation by the caller cannot change resolved config unnoticed.
    const owned = copyConfigPatch(patch);
    if (!this.options.retainPatches) {
      // Spread onto the current value, not resolved: this patch is not a layer. A plain spread lets an
      // explicit `undefined` clear a field, which `resolve` would skip.
      const patched = { ...this.value, ...owned } as TConfig;
      // `resolve` applies authority itself, this path does not. The patch is not kept, so a value the
      // server lowers is not restored if the server later relents.
      const { applyAuthority } = this.options;
      this.write(applyAuthority ? applyAuthority(patched) : patched);
      return;
    }
    this.patchLayer = mergeWith(
      this.patchLayer as object,
      owned as object,
    ) as Partial<TConfig>;
    this.write(this.resolve({ withBehaviourOverrides: true }));
  }

  /** Layers over the package defaults, later wins (`docs/instance-configuration.md` §3). */
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

    // Seeded with a shallow spread: untouched subtrees stay the frozen default. `mergeWith` copies the
    // subtrees a layer touches and never writes into its target.
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
