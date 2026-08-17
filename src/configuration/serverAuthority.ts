import { mergeWith } from '../utils/mergeWith';
import type { MergeWithCustomizer } from '../utils/mergeWith/mergeWithCore';
import type { DeepPartial } from '../types.utility';

/**
 * The fields a server decides for some configurable object — a partial configuration holding *only* those
 * fields, with the value the server currently reports.
 *
 * Only server-decided fields may appear. The merge below lets any scalar on this side win, so an
 * unrelated field smuggled in here would override the caller's value while looking like a server
 * restriction.
 */
export type ServerRestrictions<TConfig extends object> = DeepPartial<TConfig>;

/**
 * Merges a set of server restrictions over a requested configuration under two rules:
 *
 * 1. **Booleans are ANDed.** A flag the *client* turned off stays off even where the server would allow it —
 *    asking for less than you are granted is always legitimate — and a flag the server turned off stays off
 *    whatever the client asked. Either side may narrow; neither may widen.
 * 2. **Any other scalar: the server wins.** This is what makes "client configuration can only narrow what
 *    the server grants" true rather than aspirational.
 *
 * Objects are left to the normal deep merge, so the rules apply leaf by leaf.
 *
 * A third rule lives in {@link ServerUpperBounds}, passed separately because a ceiling narrows rather than
 * replaces.
 *
 * **Rule 1 is deliberately not keyed on a field name.** It used to read `key === 'enabled'`, which happened
 * to be correct because `location.enabled` was the only boolean restriction — and was a trap for whoever
 * added the next one. A gate named anything else (`text.publishTypingEvents` for `typing_events`, say) would
 * have fallen through to rule 2, and a client's deliberate `false` would have been overwritten by a
 * permissive server: exactly the widening **DV-16** was about, reintroduced one field at a time. Boolean
 * restrictions are gates, and the conjunction of two gates is the rule for all of them.
 */
const serverRestrictionCustomizer: MergeWithCustomizer<object> = (
  requestedValue,
  restrictionValue,
) => {
  // Not a leaf — hand it back to the deep merge and decide further down.
  //
  // `typeof null === 'object'`, so `null` is excluded explicitly: it has no interior to descend into. The
  // upper-bound customizer below has always guarded this and this one did not; the two disagreeing was a
  // latent difference rather than a live bug, since no configuration field is nullable today.
  const isInterior = (value: unknown) => typeof value === 'object' && value !== null;
  if (isInterior(requestedValue)) return undefined;
  // Nothing requested here but the server describes a subtree — descend so it lands, rather than answering
  // with the absent request and dropping it. Deliberately *not* extended to a requested scalar under an
  // object restriction: rule 2 refuses that below, which is the point of its scalar check.
  if (requestedValue == null && isInterior(restrictionValue)) return undefined;

  // Rule 1: both sides are gates, so the stricter one wins whichever side it is on.
  if (typeof requestedValue === 'boolean' && typeof restrictionValue === 'boolean') {
    return requestedValue && restrictionValue;
  }

  // Rule 2: the server had the last word.
  if (
    ['string', 'number', 'bigint', 'boolean', 'symbol'].includes(typeof restrictionValue)
  ) {
    return restrictionValue;
  }

  // The server stated nothing for this field, so the request stands.
  return requestedValue;
};

/**
 * Numeric ceilings the server imposes — a partial configuration holding only fields where the server states
 * a *maximum*, such as a channel type's `max_message_length`.
 *
 * Separate from {@link ServerRestrictions} because the two combine differently, and putting a ceiling in the
 * wrong bucket is a silent bug rather than a type error: a restriction *replaces* the requested value, which
 * for a limit would widen a caller who deliberately asked for something stricter.
 */
export type ServerUpperBounds<TConfig extends object> = DeepPartial<TConfig>;

/**
 * Tightest wins. A ceiling can only lower the requested value, never raise it — and it applies in full when
 * the caller asked for no limit at all, which is the common case and the reason the server's maximum is
 * worth reading: an unlimited composer otherwise lets a message be written that the API will reject.
 */
const upperBoundCustomizer: MergeWithCustomizer<object> = (
  requestedValue,
  boundValue,
) => {
  // Not a leaf — hand it back to the deep merge and decide at the leaves.
  if (typeof requestedValue === 'object' && requestedValue !== null) return undefined;
  // The server states no ceiling for this field, so the request stands.
  if (typeof boundValue !== 'number') return requestedValue;
  // No client limit — the server's is the effective one. For `undefined` the deep merge would reach the
  // same answer on its own; the branch earns its place on a value that is neither, where delegating
  // would keep the nonsense and drop the ceiling.
  if (typeof requestedValue !== 'number') return boundValue;

  return Math.min(requestedValue, boundValue);
};

/**
 * Applies a server's restrictions to a configuration a caller asked for, so the result never claims more
 * than the server allows.
 *
 * **Why this is a named function rather than an inline merge.** It has to run on *every* route by which a
 * configuration can change — construction, the declarative tree, a setup function, a direct
 * `updateConfig` — because a restriction applied only at construction holds until the first time anything
 * updates the configuration and then silently stops holding. `MessageComposer` learned this the hard way:
 * only its `deriveConfig` applied the restrictions, so registering `location.enabled: true` on a running
 * app widened past a `shared_locations: false` server and produced a composer offering a feature the API
 * rejects (**DV-16**).
 *
 * **What it deliberately does not do.** It knows nothing about *where* restrictions come from. Reading
 * them is the entity's job, because only the entity knows what to ask — a composer reads its channel's
 * `getConfig()`, something else might read capabilities — and the answer depends on an instance that
 * exists. That is also why this does not live in `InstanceConfigurationService`: that service merges
 * declarative layers before any instance exists, and its merges follow the opposite rule (a more specific
 * layer *may* re-enable what a broader one disabled), which rule 1 would break.
 *
 * @example
 * ```ts
 * // Inside a configurable class, on every path that resolves configuration:
 * this.configState.partialNext(
 *   mergeServerRestrictions(requestedConfig, {
 *     location: { enabled: this.channel.getConfig()?.shared_locations },
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
