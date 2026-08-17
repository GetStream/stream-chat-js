import type { DeclarativePaginatorConfig } from '../pagination/paginators/BasePaginator';
import type { MessageOperationsConfig } from '../messageOperations/MessageOperations';
import type { DeclarativeMessagePaginatorConfig } from './types';

/**
 * How a declarative subtree is combined before it reaches the object that owns it.
 *
 * Two shared keys (`messagePaginator`, `messageOperations`) are also offered nested under `channel` and
 * `thread`, so an owner has to layer the general registration and its own override — and, for the
 * paginator, split off the one member of the subtree that is a construction argument rather than
 * configuration.
 */

/**
 * Layers a per-parent slice of a **shared** configuration key over the shared one, field by field.
 *
 * Two keys are shared between `Channel` and `Thread` — `messagePaginator` and `messageOperations`
 * (**DEC-25**, **DV-15**) — because both entities own one of each and most of the settings mean the same
 * thing under either parent. The shared key carries what is common; the per-parent slice overrides only the
 * fields it names.
 *
 * Fields the specific slice does not mention — including ones it sets to `undefined` explicitly — fall
 * through to the shared slice, so `{ messagePaginator: { pageSize: 50 } }` is not undone by a
 * `channel.messagePaginator` slice that only names `stateThrottleMs`. That `undefined` skip is the whole
 * reason this is not a plain object spread.
 *
 * One level deep on purpose: every field on both config types is a scalar or a function, so there is no
 * nested object for a deep merge to reach. Use `mergeWith` if that stops being true.
 */
const mergeDeclarativeSlice = <TConfig extends object>(
  general?: TConfig,
  specific?: TConfig,
): TConfig | undefined => {
  if (!general) return specific;
  if (!specific) return general;

  const merged: TConfig = { ...general };
  for (const [key, value] of Object.entries(specific)) {
    if (typeof value === 'undefined') continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
};

/** Layers `channel.messageOperations` / `thread.messageOperations` over the shared `messageOperations` key. */
export const mergeDeclarativeMessageOperationsConfig = (
  general?: Partial<MessageOperationsConfig>,
  specific?: Partial<MessageOperationsConfig>,
): Partial<MessageOperationsConfig> | undefined =>
  mergeDeclarativeSlice(general, specific);

/** Layers `channel.messagePaginator` / `thread.messagePaginator` over the shared `messagePaginator` key. */
export const mergeDeclarativePaginatorConfig = (
  general?: DeclarativeMessagePaginatorConfig,
  specific?: DeclarativeMessagePaginatorConfig,
): DeclarativeMessagePaginatorConfig | undefined =>
  mergeDeclarativeSlice(general, specific);

/**
 * Drops the construction-only arguments from a message-paginator slice, leaving only what is actually
 * paginator *configuration*.
 *
 * `unreadReferencePolicy` rides in the same subtree for the integrator's convenience, but it is not a
 * `BasePaginatorConfig` field — `MessagePaginator` reads it once into a private member. Passed through to
 * `initializeConfig` it landed in the published `config` as an untyped key that nothing reads, and a
 * registration arriving after construction made resolved configuration *contradict* behaviour: the
 * construction-only warning correctly said the value would not apply, and then
 * `paginator.config.unreadReferencePolicy` reported it as though it had. A settings UI reading resolved
 * config showed `read-state-only` for a paginator behaving as `snapshot`.
 *
 * So the owning `Channel` / `Thread` splits the slice: the constructor argument goes to the constructor,
 * and only this half reaches the paginator's configuration. Both already read the policy separately, so
 * nothing is lost.
 */
export const toDeclarativePaginatorConfig = (
  slice?: DeclarativeMessagePaginatorConfig,
): DeclarativePaginatorConfig | undefined => {
  if (!slice) return undefined;
  const { unreadReferencePolicy: _constructionOnly, ...paginatorConfig } = slice;
  return paginatorConfig;
};
