import { describe, expect, it } from 'vitest';
import {
  ECHO_KIND_BY_EVENT_TYPE,
  type EchoPairingKind,
  describePairedWrite,
  getEchoKey,
  getReactionRequestId,
  ingestChangesMembership,
} from '../../../src/mutationEcho/keys';
import { formatMessage } from '../../../src/utils';
import type { MessageResponse, ReactionResponse } from '../../../src/gen/models';

/** One server row, the thing both sides of a pairing are actually handed. */
const serverMessage = {
  cid: 'messaging:general',
  created_at: 1_700_000_000_000_000_000,
  html: '<p>hi</p>',
  id: 'msg-1',
  pinned: false,
  text: 'hi',
  type: 'regular',
  updated_at: 1_700_000_000_000_000_000,
  user: { id: 'u1' },
} as unknown as MessageResponse;

const serverReaction = {
  created_at: 1_700_000_000_000_000_000,
  custom: {},
  message_id: 'msg-1',
  score: 1,
  type: 'like',
  updated_at: 1_700_000_000_000_000_000,
  user: { id: 'u1' },
  user_id: 'u1',
} as unknown as ReactionResponse;

const MESSAGE_KINDS = ['message-new', 'message-updated', 'message-deleted'] as const;
const REACTION_KINDS = ['reaction-new', 'reaction-updated', 'reaction-deleted'] as const;

describe('mutationEcho keys', () => {
  // The property the whole mechanism rests on: the HTTP application site and the WS handler must
  // derive the same string from the same server row. The HTTP side passes the response through
  // `formatMessage` before writing; the WS side does the same to the event payload. If those two
  // diverged, the gate would never fire and every paired write would keep applying twice.
  describe('the two sides of a pairing agree', () => {
    it.each(MESSAGE_KINDS)('%s — raw response and formatted copy agree', (kind) => {
      const fromHttp = getEchoKey({ message: formatMessage(serverMessage) }, kind);
      const fromWs = getEchoKey({ message: serverMessage }, kind);

      expect(fromHttp).toBeDefined();
      expect(fromHttp).toBe(fromWs);
    });

    it.each(REACTION_KINDS)('%s — both sides agree', (kind) => {
      const fromHttp = getEchoKey({ reaction: serverReaction }, kind);
      const fromWs = getEchoKey({ reaction: { ...serverReaction } }, kind);

      expect(fromHttp).toBeDefined();
      expect(fromHttp).toBe(fromWs);
    });

    it('message-hard-deleted agrees across sides', () => {
      expect(getEchoKey({ message: serverMessage }, 'message-hard-deleted')).toBe(
        getEchoKey({ message: serverMessage }, 'message-hard-deleted'),
      );
    });
  });

  describe('non-collision matrix', () => {
    // The version discriminator: a stale entry must not be able to swallow a genuinely newer write.
    // One millisecond apart — far below anything two real server writes could be.
    it('separates two versions of the same message', () => {
      const older = getEchoKey({ message: serverMessage }, 'message-new');
      const newer = getEchoKey(
        {
          message: { ...serverMessage, updated_at: serverMessage.updated_at + 1_000_000 },
        },
        'message-new',
      );

      expect(older).not.toBe(newer);
    });

    // Pins the floor rather than pretending it isn't there: unix-nanosecond timestamps exceed
    // Number.MAX_SAFE_INTEGER (see src/utils/time.ts), so around 1.7e18 the representable step is
    // 256ns and two writes closer than that would share a key. No real pair of server writes is
    // sub-microsecond apart, so this bounds the discriminator rather than breaking it.
    it('cannot separate two versions less than 256ns apart (float precision floor)', () => {
      const a = getEchoKey({ message: serverMessage }, 'message-new');
      const b = getEchoKey(
        {
          message: { ...serverMessage, updated_at: serverMessage.updated_at + 1 },
        },
        'message-new',
      );

      expect(a).toBe(b);
    });

    it('separates the message kinds from each other', () => {
      const keys = MESSAGE_KINDS.map((kind) =>
        getEchoKey({ message: serverMessage }, kind),
      );

      expect(new Set(keys).size).toBe(MESSAGE_KINDS.length);
    });

    it('separates the reaction kinds from each other', () => {
      const keys = REACTION_KINDS.map((kind) =>
        getEchoKey({ reaction: serverReaction }, kind),
      );

      expect(new Set(keys).size).toBe(REACTION_KINDS.length);
    });

    it('separates a soft delete from the edit that preceded it', () => {
      const edited = getEchoKey({ message: serverMessage }, 'message-deleted');
      const deleted = getEchoKey(
        {
          message: { ...serverMessage, deleted_at: serverMessage.updated_at },
        },
        'message-deleted',
      );

      expect(edited).not.toBe(deleted);
    });

    it('separates a soft delete from a hard delete', () => {
      expect(getEchoKey({ message: serverMessage }, 'message-deleted')).not.toBe(
        getEchoKey({ message: serverMessage }, 'message-hard-deleted'),
      );
    });

    it('separates two users reacting with the same type to the same message', () => {
      const mine = getEchoKey({ reaction: serverReaction }, 'reaction-new');
      const theirs = getEchoKey(
        { reaction: { ...serverReaction, user_id: 'u2' } },
        'reaction-new',
      );

      expect(mine).not.toBe(theirs);
    });

    it('separates two reaction types from the same user', () => {
      const like = getEchoKey({ reaction: serverReaction }, 'reaction-new');
      const love = getEchoKey(
        { reaction: { ...serverReaction, type: 'love' } },
        'reaction-new',
      );

      expect(like).not.toBe(love);
    });
  });

  // `undefined` is never an error — it means "no key, so apply". This is what keeps the offline path
  // correct: a queued request can resolve with nothing, and nothing is then armed.
  describe('unkeyable payloads yield undefined', () => {
    it.each(MESSAGE_KINDS)('%s — missing message', (kind) => {
      expect(getEchoKey({ message: undefined }, kind)).toBeUndefined();
      expect(getEchoKey({ message: null }, kind)).toBeUndefined();
    });

    it.each(MESSAGE_KINDS)('%s — message with no updated_at', (kind) => {
      const { updated_at: _omitted, ...withoutUpdatedAt } = serverMessage;

      expect(
        getEchoKey({ message: withoutUpdatedAt as unknown as MessageResponse }, kind),
      ).toBeUndefined();
    });

    it.each(REACTION_KINDS)('%s — missing reaction', (kind) => {
      expect(getEchoKey({ reaction: undefined }, kind)).toBeUndefined();
    });

    it.each(REACTION_KINDS)('%s — reaction missing its identifying fields', (kind) => {
      // The existing SDK test fixtures hand back `reaction: {}` from a mocked response; without this
      // guard that would build a key out of `undefined`s that unrelated reactions could both match.
      expect(
        getEchoKey({ reaction: {} as unknown as ReactionResponse }, kind),
      ).toBeUndefined();
      expect(
        getEchoKey(
          {
            reaction: {
              ...serverReaction,
              user_id: undefined,
            } as unknown as ReactionResponse,
          },
          kind,
        ),
      ).toBeUndefined();
    });

    it('message-hard-deleted — missing id', () => {
      expect(getEchoKey({ message: undefined }, 'message-hard-deleted')).toBeUndefined();
    });
  });

  describe('ECHO_KIND_BY_EVENT_TYPE', () => {
    // The lookup the disarm sites use. Typed as an exhaustive Record in src, so `yarn types` already
    // rejects a paired event with no kind; this pins the actual mapping, which a type cannot.
    it('maps every paired event to a distinct kind', () => {
      const kinds = Object.values(ECHO_KIND_BY_EVENT_TYPE);

      expect(new Set(kinds).size).toBe(kinds.length);
    });

    it('maps message.deleted to the SOFT delete kind', () => {
      // A hard delete is a removal and is keyed as `message-hard-deleted` at the one site that knows
      // which it was — the event alone cannot tell them apart.
      expect(ECHO_KIND_BY_EVENT_TYPE['message.deleted']).toBe('message-deleted');
    });

    it.each(Object.entries(ECHO_KIND_BY_EVENT_TYPE))(
      '%s produces a usable key via its mapped kind',
      (_eventType, kind) => {
        const payload = kind.startsWith('reaction')
          ? { reaction: serverReaction }
          : { message: serverMessage };

        expect(getEchoKey(payload as never, kind as EchoPairingKind)).toEqual(
          expect.any(String),
        );
      },
    );
  });
  describe('getReactionRequestId', () => {
    const base = { messageId: 'm1', type: 'love', userId: 'u1' };

    it('is stable for the same operation', () => {
      expect(getReactionRequestId(base)).toBe(getReactionRequestId({ ...base }));
    });

    // The three axes that make it narrower than the message case's bare id. Each of these is a
    // DIFFERENT operation, and treating any of them as ours would arm on someone else's event.
    it.each([
      ['message', { ...base, messageId: 'm2' }],
      ['type', { ...base, type: 'haha' }],
      ['user', { ...base, userId: 'u2' }],
    ])('differs by %s', (_axis, other) => {
      expect(getReactionRequestId(other)).not.toBe(getReactionRequestId(base));
    });

    // Fails open exactly like `getEchoKey`: an unkeyable payload tracks nothing, so the WS side does
    // not arm and the pair costs what it costs today.
    it.each([
      ['messageId', { ...base, messageId: undefined }],
      ['type', { ...base, type: undefined }],
      ['userId', { ...base, userId: undefined }],
    ])('is undefined without %s', (_field, incomplete) => {
      expect(getReactionRequestId(incomplete)).toBeUndefined();
    });

    // It identifies the OPERATION, not a version of a write — the request cannot know `updated_at`
    // before the server answers. This is why it is a separate function from `getEchoKey`.
    it('carries no version component', () => {
      expect(getReactionRequestId(base)).not.toContain('undefined');
      expect(getReactionRequestId(base)).toBe('reaction|m1|u1|love');
    });
  });
  /**
   * The single derivation point. These assert the two identities are wired to the right thing for
   * each payload shape — the half `ensureExhausted` cannot check, since it only forces a `case` to
   * exist, not to be correct.
   */
  describe('describePairedWrite', () => {
    it('keys a message upsert as getEchoKey does, and tracks it by message id', () => {
      const message = formatMessage(serverMessage);
      const described = describePairedWrite({
        kind: 'message-new',
        message,
      });

      expect(described.key).toBe(getEchoKey({ message }, 'message-new'));
      expect(described.requestId).toBe(message.id);
    });

    it('tracks a hard delete by message id', () => {
      const described = describePairedWrite({
        kind: 'message-hard-deleted',
        message: { id: 'm1', updated_at: 1 } as never,
      });

      expect(described.key).toBe(
        getEchoKey(
          { message: { id: 'm1', updated_at: 1 } as never },
          'message-hard-deleted',
        ),
      );
      expect(described.requestId).toBe('m1');
    });

    // The reaction case is the one that must NOT fall back to the message id: two people reacting to
    // one message are separate operations.
    it('tracks a reaction by its own triple, not by the message', () => {
      const reaction = {
        message_id: 'm1',
        type: 'love',
        updated_at: 1,
        user_id: 'u1',
      } as unknown as ReactionResponse;
      const described = describePairedWrite({
        kind: 'reaction-new',
        reaction,
      });

      expect(described.key).toBe(getEchoKey({ reaction }, 'reaction-new'));
      expect(described.requestId).toBe(
        getReactionRequestId({ messageId: 'm1', type: 'love', userId: 'u1' }),
      );
      expect(described.requestId).not.toBe('m1');
    });

    it('yields undefined identities for an unkeyable payload, which means apply', () => {
      const described = describePairedWrite({
        kind: 'reaction-new',
        reaction: undefined,
      });

      expect(described.key).toBeUndefined();
      expect(described.requestId).toBeUndefined();
    });
  });
});

/**
 * The half of the gate a key cannot express.
 *
 * A key answers "does the canonical copy already hold this version"; it says nothing about whether a
 * collection HOLDS the message, and the store's fan-out never adds or evicts. So every paginator-backed
 * call site pairs the key with this, and a wrong answer here is the difference between a redundant
 * re-render and a message missing from a list.
 */
describe('ingestChangesMembership', () => {
  const msg = { id: 'm1' };

  const probe = ({
    located,
    matches,
    stored = true,
  }: {
    located: boolean;
    matches: boolean;
    stored?: boolean;
  }) => ({
    getItem: () => (stored ? { id: 'm1', previous: true } : undefined),
    locateByItem: () => (located ? { interval: {} } : {}),
    matchesFilter: () => matches,
  });

  it('is false when the collection holds it and it still matches — content only', () => {
    expect(ingestChangesMembership(probe({ located: true, matches: true }), msg)).toBe(
      false,
    );
  });

  it('is true when it matches but the collection does not hold it — a pin, or a reply arriving', () => {
    expect(
      ingestChangesMembership(
        probe({ located: false, matches: true, stored: false }),
        msg,
      ),
    ).toBe(true);
  });

  it('is true when the collection holds it and it no longer matches — an unpin', () => {
    expect(ingestChangesMembership(probe({ located: true, matches: false }), msg)).toBe(
      true,
    );
  });

  it('is false when neither holds nor matches — the ingest is a no-op either way', () => {
    expect(
      ingestChangesMembership(
        probe({ located: false, matches: false, stored: false }),
        msg,
      ),
    ).toBe(false);
  });

  // The regression that forced this to read intervals rather than the index. `ItemIndex` keeps an id
  // whose intervals have already dropped it (`applyItemIngestion` writes the index even on a filter
  // miss), so a message being RE-pinned looks "already held" to `getItem` alone — and skipping that
  // ingest is the only thing that would have put it back.
  it('is true for an id the index still knows but the intervals have dropped', () => {
    expect(ingestChangesMembership(probe({ located: false, matches: true }), msg)).toBe(
      true,
    );
  });
});
