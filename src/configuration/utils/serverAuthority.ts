import { mergeWith } from '../../utils/mergeWith';
import type { MergeWithCustomizer } from '../../utils/mergeWith/mergeWithCore';
import type { DeepPartial } from '../../types.utility';

/**
 * The fields a server decides, with the values it reports. Include only those: a non-boolean scalar
 * here overrides the caller's, and a boolean is ANDed with it.
 */
export type ServerRestrictions<TConfig extends object> = DeepPartial<TConfig>;

/**
 * Booleans are ANDed (either side may narrow, neither may widen); any other scalar takes the server's
 * value. Objects deep-merge, so this applies per leaf. Not keyed on field names: every boolean
 * restriction is a gate.
 */
const serverRestrictionCustomizer: MergeWithCustomizer<object> = (
  requestedValue,
  restrictionValue,
) => {
  // Not a leaf: let the deep merge descend. `null` is excluded because `typeof null === 'object'`.
  const isInterior = (value: unknown) => typeof value === 'object' && value !== null;
  if (isInterior(requestedValue)) return undefined;
  // Nothing requested but the server describes a subtree: descend so it lands.
  if (requestedValue == null && isInterior(restrictionValue)) return undefined;

  // Both gates: the stricter side wins.
  if (typeof requestedValue === 'boolean' && typeof restrictionValue === 'boolean') {
    return requestedValue && restrictionValue;
  }

  // Any other scalar: the server wins.
  if (
    ['string', 'number', 'bigint', 'boolean', 'symbol'].includes(typeof restrictionValue)
  ) {
    return restrictionValue;
  }

  // The server stated nothing for this field, so the request stands.
  return requestedValue;
};

/**
 * Fields where the server states a maximum (e.g. `max_message_length`). Separate from
 * {@link ServerRestrictions} because a restriction replaces the value, which would widen a stricter
 * caller.
 */
export type ServerUpperBounds<TConfig extends object> = DeepPartial<TConfig>;

/** Tightest wins. A ceiling applies in full when the caller asked for no limit. */
const upperBoundCustomizer: MergeWithCustomizer<object> = (
  requestedValue,
  boundValue,
) => {
  // Not a leaf: let the deep merge descend.
  if (typeof requestedValue === 'object' && requestedValue !== null) return undefined;
  // No ceiling stated: the request stands.
  if (typeof boundValue !== 'number') return requestedValue;
  // No client limit (or a non-number): the server's ceiling applies.
  if (typeof requestedValue !== 'number') return boundValue;

  return Math.min(requestedValue, boundValue);
};

/**
 * Applies server restrictions to a requested configuration, so the result never claims more than the
 * server allows. Call it on every route that changes a configuration (construction, declarative tree,
 * setup function, `updateConfig`), or the restrictions stop holding at the first update. Reading the
 * restrictions is the entity's job.
 *
 * @example
 * ```ts
 * // Inside a configurable class, on every path that resolves configuration:
 * this.configState.partialNext(
 *   mergeServerRestrictions(requestedConfig, {
 *     location: { enabled: this.channel.serverConfig?.shared_locations },
 *   }),
 * );
 * ```
 */
export const mergeServerRestrictions = <TConfig extends object>(
  requested: TConfig,
  restrictions: ServerRestrictions<TConfig>,
  upperBounds?: ServerUpperBounds<TConfig>,
): TConfig => {
  const restricted = mergeWith(
    requested,
    restrictions,
    serverRestrictionCustomizer as MergeWithCustomizer<TConfig>,
  );

  if (!upperBounds) return restricted;

  return mergeWith(
    restricted,
    upperBounds,
    upperBoundCustomizer as MergeWithCustomizer<TConfig>,
  );
};
