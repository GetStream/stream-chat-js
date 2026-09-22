import { ensureExhausted } from '../utils/ensureExhausted';
import type { ReactionResponse, WSEvent } from '../gen/models';
import type { LocalMessage } from '../types';

/**
 * # Adding a pairing
 *
 * 1. Add a member to {@link EchoPairingKind}. That alone breaks the build in the three places below.
 * 2. Declare its payload in {@link EchoPayloadByKind}.
 * 3. Add a `case` to {@link getEchoKey} — how the write is identified, including its server version.
 * 4. Add a `case` to {@link describePairedWrite} — the same, plus the request producing its twin.
 * 5. Add the event to {@link ECHO_KIND_BY_EVENT_TYPE}.
 *
 * Then wrap the WS write in `mutationEcho.applyOnce(...)` and call `wasApplied` / `recordApplied`
 * around the HTTP one.
 *
 * This only guards unions we hand-write — nothing fires when a new event appears in the generated
 * `WSEvent` union, which would break the build on every unrelated spec regeneration.
 */

/** Structural, so this module does not depend on the pagination layer. */
export type MembershipProbe<T> = {
  getItem: (id: string) => T | undefined;
  matchesFilter: (item: T) => boolean;
  locateByItem: (item: T) => { state?: unknown; interval?: unknown };
};

/**
 * Whether ingesting `message` would change what `collection` HOLDS, rather than only what it shows.
 *
 * A key says the canonical copy already holds this version, which every collection sharing the store
 * then shows for free — but the fan-out never adds or evicts, so the WS event is the only thing that
 * can change membership. Membership changes exactly when holding and matching disagree.
 *
 * The case this is load-bearing for: a `show_in_channel` reply sent from a `Thread` arms its key via
 * the thread's own `ingest`, and the channel's main list — which does not hold it and has no HTTP
 * write of its own — is reached only by `message.new`. Skip that and the reply never appears in the
 * channel. (Pinning through `client.pinMessage` is NOT one of these: it goes via
 * `updateMessagePartial`, which arms no key, so no gate fires for it either way.)
 *
 * Held means "in an interval", NOT "in the index": `getItem` reads `ItemIndex`, which keeps an id
 * whose intervals already dropped it, so reading it alone would call a message being RE-pinned
 * "already held" and lose it from the pinned list. The previous snapshot is what gets located,
 * because the new one's sort key is exactly what changed.
 */
export const ingestChangesMembership = <T>(
  collection: MembershipProbe<T>,
  message: T & { id: string },
): boolean => {
  const previous = collection.getItem(message.id);
  const coordinates =
    previous === undefined ? undefined : collection.locateByItem(previous);
  const holds = !!(coordinates?.state || coordinates?.interval);
  return holds !== collection.matchesFilter(message);
};

/**
 * One member per paired WS event, deliberately not collapsed by write shape: it is what forces a new
 * `case` below when a further event is paired, and `kind` is part of the key, so a send's entry can
 * never match an edit's event even if the server reuses `updated_at`.
 */
export type EchoPairingKind =
  | 'message-new'
  | 'message-updated'
  /** Soft delete — an upsert of a `type: 'deleted'` copy, not a removal. */
  | 'message-deleted'
  | 'message-hard-deleted'
  | 'reaction-new'
  | 'reaction-updated'
  | 'reaction-deleted';

/**
 * Every message write site has a formatted copy in hand, so the payload takes the whole thing — that
 * is what lets a gated ingest derive its own membership answer instead of the caller passing one.
 */
export type MessageLike = LocalMessage | null | undefined;

export type EchoPayloadByKind = {
  'message-new': { message: MessageLike };
  'message-updated': { message: MessageLike };
  'message-deleted': { message: MessageLike };
  'message-hard-deleted': { message: MessageLike };
  'reaction-new': { reaction: ReactionResponse | undefined };
  'reaction-updated': { reaction: ReactionResponse | undefined };
  'reaction-deleted': { reaction: ReactionResponse | undefined };
};

/** Binds each payload to its kind, so the two sides of a pairing cannot pass different shapes. */
export type EchoPairTuples = {
  [K in EchoPairingKind]: [EchoPayloadByKind[K], K];
}[EchoPairingKind];

/** Every kind whose payload is a message. Only reactions differ, being a different entity. */
export type MessageEchoKind = Extract<
  EchoPairingKind,
  'message-new' | 'message-updated' | 'message-deleted' | 'message-hard-deleted'
>;

/** The kinds whose payload is a reaction. */
export type ReactionEchoKind = Extract<
  EchoPairingKind,
  'reaction-new' | 'reaction-updated' | 'reaction-deleted'
>;

/**
 * What a reaction operation is tracked under while in flight ({@link MutationEcho.trackRequest}).
 * Narrower than a bare message id, so two people reacting to the same message — or one person
 * reacting while editing it — are not mistaken for each other. Carries no version, unlike an echo
 * key: the client cannot know `updated_at` before the server answers.
 */
export const getReactionRequestId = ({
  messageId,
  type,
  userId,
}: {
  messageId: string | undefined;
  type: string | undefined;
  userId: string | undefined;
}): string | undefined =>
  messageId && type && userId
    ? ['reaction', messageId, userId, type].join('|')
    : undefined;

/**
 * The key both sides of a pairing recognise each other by, or `undefined` when the payload cannot
 * produce one — which means "apply", never an error, and is what keeps a queued offline send correct.
 *
 * Every key carries the server's `updated_at`, read off the same row both sides were handed, so a
 * leftover entry can only suppress a write identical to one already applied. Resolution is bounded:
 * unix-nanosecond timestamps exceed `Number.MAX_SAFE_INTEGER`, so near 1.7e18 the smallest step is
 * 256ns — below anything the backend produces, and the TTL caps the damage regardless.
 *
 * Three overloads because a caller holding a widened `kind` matches no single tuple member.
 */
export function getEchoKey(
  data: { message: MessageLike },
  kind: MessageEchoKind,
): string | undefined;
export function getEchoKey(
  data: { reaction: ReactionResponse | undefined },
  kind: ReactionEchoKind,
): string | undefined;
export function getEchoKey(...args: EchoPairTuples): string | undefined {
  const [data, kind] = args;
  const toJoin: string[] = [kind];

  switch (kind) {
    case 'message-new':
    case 'message-updated':
    case 'message-deleted': {
      const { message } = data;
      if (!message?.id || message.updated_at == null) return undefined;
      // `deleted_at` separates a soft delete from the edit before it, if `updated_at` is reused.
      return toJoin
        .concat([
          message.id,
          String(message.updated_at),
          String(message.deleted_at ?? ''),
        ])
        .join('|');
    }
    case 'message-hard-deleted': {
      // No version: a removal has nothing to compare against, so the id alone identifies it.
      const { message } = data;
      if (!message?.id) return undefined;
      return toJoin.concat([message.id]).join('|');
    }
    case 'reaction-new':
    case 'reaction-updated':
    case 'reaction-deleted': {
      const { reaction } = data;
      // Every field must be present: a partial reaction would build a key out of `undefined`s that
      // two unrelated reactions could both match.
      if (!reaction?.message_id || !reaction.user_id || !reaction.type) return undefined;
      if (reaction.updated_at == null) return undefined;
      return toJoin
        .concat([
          reaction.message_id,
          reaction.user_id,
          reaction.type,
          String(reaction.updated_at),
        ])
        .join('|');
    }
    default:
      return ensureExhausted(data, 'Encountered unknown mutation echo pairing kind.');
  }
}

/**
 * The two identities of one write, derived in this one place so call sites never build either: the
 * **key** (a version of a write) and the **request id** (the operation, version-free).
 */
export type PairedWrite = {
  [K in EchoPairingKind]: { kind: K } & EchoPayloadByKind[K];
}[EchoPairingKind];

export type PairedWriteIdentity = {
  key: string | undefined;
  requestId: string | undefined;
};

export const describePairedWrite = (write: PairedWrite): PairedWriteIdentity => {
  switch (write.kind) {
    case 'message-new':
    case 'message-updated':
    case 'message-deleted': {
      const { kind, ...payload } = write;
      // A message has one operation queue, so its id is the operation.
      return { key: getEchoKey(payload, kind), requestId: payload.message?.id };
    }
    case 'message-hard-deleted': {
      const { kind, ...payload } = write;
      return { key: getEchoKey(payload, kind), requestId: payload.message?.id };
    }
    case 'reaction-new':
    case 'reaction-updated':
    case 'reaction-deleted': {
      const { kind, ...payload } = write;
      return {
        key: getEchoKey(payload, kind),
        requestId: getReactionRequestId({
          messageId: payload.reaction?.message_id,
          type: payload.reaction?.type,
          userId: payload.reaction?.user_id,
        }),
      };
    }
    default:
      return ensureExhausted(write, 'Encountered unknown mutation echo pairing kind.');
  }
};

/** The WS events that participate in a pairing. */
export type PairedEventType = Extract<
  WSEvent['type'],
  | 'message.new'
  | 'message.updated'
  | 'message.deleted'
  | 'reaction.new'
  | 'reaction.updated'
  | 'reaction.deleted'
>;

/**
 * The kind each paired event checks, as an exhaustive `Record` so naming an event in
 * {@link PairedEventType} without giving it a kind fails the build. `message.deleted` maps to the
 * SOFT kind; a hard delete is a removal, keyed at the one site that knows which it was.
 */
export const ECHO_KIND_BY_EVENT_TYPE = {
  'message.new': 'message-new',
  'message.updated': 'message-updated',
  'message.deleted': 'message-deleted',
  'reaction.new': 'reaction-new',
  'reaction.updated': 'reaction-updated',
  'reaction.deleted': 'reaction-deleted',
  // `satisfies`, not an annotation: an annotation would widen each value and the call sites need
  // the literal for `getEchoKey`'s overloads. Completeness is still enforced.
} as const satisfies Record<PairedEventType, EchoPairingKind>;
