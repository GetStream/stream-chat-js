import type { DeclarativePaginatorConfig } from '../../pagination/paginators/BasePaginator';
import type { MessageOperationsConfig } from '../../messageOperations/MessageOperations';
import type { DeclarativeMessagePaginatorConfig } from '../types';

/**
 * Layers a per-parent slice of a shared key (`messagePaginator`, `messageOperations`) over the shared
 * one, field by field. Fields the specific slice omits or sets to `undefined` fall through to the shared
 * slice, which is why this is not a plain spread. One level deep: an object field such as
 * `initialCursor` replaces the shared one whole.
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

/** Layers a per-parent `messageOperations` slice (channel or thread) over the shared key. */
export const mergeDeclarativeMessageOperationsConfig = (
  general?: Partial<MessageOperationsConfig>,
  specific?: Partial<MessageOperationsConfig>,
): Partial<MessageOperationsConfig> | undefined =>
  mergeDeclarativeSlice(general, specific);

/** Layers a per-parent `messagePaginator` slice (channel or thread) over the shared key. */
export const mergeDeclarativePaginatorConfig = (
  general?: DeclarativeMessagePaginatorConfig,
  specific?: DeclarativeMessagePaginatorConfig,
): DeclarativeMessagePaginatorConfig | undefined =>
  mergeDeclarativeSlice(general, specific);

/**
 * Drops `unreadReferencePolicy` from a message-paginator slice. `MessagePaginator` reads it once as a
 * constructor argument, so leaving it in would make the resolved `config` report a value that does not
 * apply.
 */
export const toDeclarativePaginatorConfig = (
  slice?: DeclarativeMessagePaginatorConfig,
): DeclarativePaginatorConfig | undefined => {
  if (!slice) return undefined;
  const { unreadReferencePolicy: _constructionOnly, ...paginatorConfig } = slice;
  return paginatorConfig;
};
