import { beforeEach, describe, expect, it } from 'vitest';
import { EntityStore } from '../../../src/entityStore/EntityStore';
import { reflectReactionEvent } from '../../../src/messageOperations';
import { formatMessage } from '../../../src';
import { generateMsg } from '../test-utils/generateMessage';
import { convertDateToTimestamp } from '../test-utils/time';
import type { StreamChat } from '../../../src/client';
import type { LocalMessage, MessageResponse, ReactionResponse } from '../../../src/types';

const CURRENT_USER_ID = 'me';

const reaction = (type: string, userId: string): ReactionResponse =>
  ({
    created_at: convertDateToTimestamp('2021-01-01T00:00:00.000Z'),
    message_id: 'r1',
    type,
    user_id: userId,
  }) as ReactionResponse;

const message = (overrides: Partial<MessageResponse> = {}) =>
  generateMsg({ id: 'r1', ...overrides }) as MessageResponse;

describe('reflectReactionEvent', () => {
  let store: EntityStore<LocalMessage>;
  let client: StreamChat;

  beforeEach(() => {
    store = new EntityStore<LocalMessage>({ getEntityId: (m) => m.id });
    client = { messageStore: store, userId: CURRENT_USER_ID } as unknown as StreamChat;
  });

  /** A holder for the id, so the store keeps the entity (it GCs ids nothing is linked to). */
  const hold = (ownReactions: ReactionResponse[]) => {
    const holder = { onEntitiesChanged: () => undefined };
    store.link('r1', holder);
    store.upsert(
      formatMessage(
        message({ latest_reactions: ownReactions, own_reactions: ownReactions }),
      ),
    );
    return holder;
  };

  it("preserves the current user's own_reactions when another user reacts", () => {
    hold([reaction('love', CURRENT_USER_ID)]);

    reflectReactionEvent(client, {
      // the server event omits our own_reactions and carries the merged groups
      message: message({
        own_reactions: [],
        reaction_groups: {
          like: { count: 1, sum_scores: 1 } as never,
          love: { count: 1, sum_scores: 1 } as never,
        },
      }),
      reaction: reaction('like', 'other'),
    });

    const updated = store.get('r1');
    expect(updated?.own_reactions?.map((r) => r.type)).toEqual(['love']);
    // the event's server-computed reaction_groups are applied as-is
    expect(updated?.reaction_groups?.like).toBeDefined();
  });

  it("adds the current user's reaction to own_reactions", () => {
    hold([]);

    reflectReactionEvent(client, {
      message: message(),
      reaction: reaction('love', CURRENT_USER_ID),
    });

    expect(store.get('r1')?.own_reactions?.map((r) => r.type)).toEqual(['love']);
  });

  it('removes the reaction from own_reactions on reaction.deleted', () => {
    hold([reaction('love', CURRENT_USER_ID)]);

    reflectReactionEvent(client, {
      message: message({ own_reactions: [] }),
      reaction: reaction('love', CURRENT_USER_ID),
      removed: true,
    });

    expect(store.get('r1')?.own_reactions ?? []).toEqual([]);
  });

  it('does not add another user reaction to own_reactions', () => {
    hold([]);

    reflectReactionEvent(client, {
      message: message(),
      reaction: reaction('love', 'other'),
    });

    expect(store.get('r1')?.own_reactions ?? []).toEqual([]);
  });

  it('is a no-op when nothing holds the message', () => {
    // A reaction reports that counts changed; it is not a signal to start holding a message that
    // was never loaded.
    reflectReactionEvent(client, {
      message: message({ id: 'never-loaded' }),
      reaction: reaction('love', CURRENT_USER_ID),
    });

    expect(store.has('never-loaded')).toBe(false);
  });

  it('writes once, so every holder is notified exactly once', () => {
    const notified: number[] = [];
    const holders = [0, 1, 2].map((i) => {
      const holder = { onEntitiesChanged: () => notified.push(i) };
      store.link('r1', holder);
      return holder;
    });
    store.upsert(formatMessage(message({ own_reactions: [] })));
    notified.length = 0;

    reflectReactionEvent(client, {
      message: message(),
      reaction: reaction('love', CURRENT_USER_ID),
    });

    expect(notified.sort()).toEqual([0, 1, 2]);
    expect(holders).toHaveLength(3);
  });
});
