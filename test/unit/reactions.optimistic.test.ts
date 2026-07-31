import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMessage, StreamChat, Thread } from '../../src';
import type {
  Channel,
  Event,
  MessageResponse,
  ReactionAPIResponse,
  ReactionGroupResponse,
  ReactionResponse,
} from '../../src';
import { generateUUIDv4 as uuidv4 } from '../../src/utils';
import { MockOfflineDB } from './offline-support/MockOfflineDB';
import { generateChannel } from './test-utils/generateChannel';
import { generateMsg } from './test-utils/generateMessage';

const CURRENT_USER = { id: 'me' };

const connect = () => {
  const client = new StreamChat('apiKey');
  client.user = CURRENT_USER;
  // `userID` is now a read-only getter derived from `client.user`, so setting `client.user` above
  // is sufficient; assigning `client.userID` directly throws.
  return client;
};

const createChannel = (client: StreamChat) => {
  const { channel: channelResponse } = generateChannel();
  const channel = client.channel(channelResponse.type, channelResponse.id);
  channel.initialized = true;
  return channel;
};

const enableOfflineDb = (client: StreamChat) => {
  client.setOfflineDBApi(new MockOfflineDB({ client }));
  const db = client.offlineDb as MockOfflineDB;
  db.state.partialNext({ initialized: true });
  db.insertReaction.mockResolvedValue([]);
  db.updateReaction.mockResolvedValue([]);
  db.deleteReaction.mockResolvedValue([]);
  return db;
};

const ownReaction = (type: string, messageId: string): ReactionResponse => ({
  created_at: '2020-01-01T00:00:00.000Z',
  message_id: messageId,
  type,
  updated_at: '2020-01-01T00:00:00.000Z',
  user: CURRENT_USER,
  user_id: CURRENT_USER.id,
});

const buildMessage = (
  ownTypes: string[] = [],
  overrides: Partial<MessageResponse> = {},
) => {
  const id = overrides.id ?? uuidv4();
  const reactions = ownTypes.map((type) => ownReaction(type, id));
  const reaction_groups = ownTypes.reduce<Record<string, ReactionGroupResponse>>(
    (groups, type) => {
      groups[type] = { count: 1, sum_scores: 1 };
      return groups;
    },
    {},
  );
  return generateMsg({
    id,
    latest_reactions: reactions,
    own_reactions: reactions,
    reaction_groups,
    ...overrides,
  });
};

const seed = (channel: Channel, message: MessageResponse) =>
  channel.messagePaginator.ingestPage({
    isHead: true,
    isTail: true,
    page: [formatMessage(message)],
    setActive: true,
  });

const ownReactionTypes = (paginator: Channel['messagePaginator'], id: string) =>
  (paginator.getItem(id)?.own_reactions ?? []).map((reaction) => reaction.type);

const apiReactionResponse = (message: MessageResponse) =>
  ({ duration: '0.0ms', message, reaction: {} }) as unknown as ReactionAPIResponse;

const networkError = () => new Error('network down');

const apiError = (code: number) =>
  Object.assign(new Error(`api-error-${code}`), { code, response: { data: {} } });

describe('optimistic reactions', () => {
  let client: StreamChat;
  let channel: Channel;

  beforeEach(() => {
    client = connect();
    channel = createChannel(client);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('apply', () => {
    it('adds the reaction to own_reactions immediately, then reconciles to the server response', async () => {
      const message = buildMessage();
      seed(channel, message);
      const serverMessage = generateMsg({
        id: message.id,
        reaction_groups: { love: { count: 9, sum_scores: 9 } },
      });
      const sendReaction = vi
        .spyOn(channel, 'sendReaction')
        .mockResolvedValue(apiReactionResponse(serverMessage));

      const pending = channel.addReactionWithLocalUpdate({
        messageId: message.id,
        reaction: { type: 'love' },
      });

      expect(ownReactionTypes(channel.messagePaginator, message.id)).toContain('love');
      expect(sendReaction).toHaveBeenCalledWith({
        id: message.id,
        reaction: { type: 'love' },
      });

      await pending;

      expect(
        channel.messagePaginator.getItem(message.id)?.reaction_groups?.love?.count,
      ).toBe(9);
    });

    it('replaces the existing own reaction when enforce_unique is set', async () => {
      const message = buildMessage(['like']);
      seed(channel, message);
      vi.spyOn(channel, 'sendReaction').mockResolvedValue(
        apiReactionResponse(generateMsg({ id: message.id })),
      );

      const pending = channel.addReactionWithLocalUpdate({
        messageId: message.id,
        reaction: { type: 'love' },
        options: { enforce_unique: true },
      });

      expect(ownReactionTypes(channel.messagePaginator, message.id)).toEqual(['love']);

      await pending;
    });

    it('removes the own reaction immediately', async () => {
      const message = buildMessage(['love']);
      seed(channel, message);
      vi.spyOn(channel, 'deleteReaction').mockResolvedValue(
        apiReactionResponse(generateMsg({ id: message.id })),
      );

      const pending = channel.deleteReactionWithLocalUpdate({
        messageId: message.id,
        type: 'love',
      });

      expect(ownReactionTypes(channel.messagePaginator, message.id)).toEqual([]);

      await pending;
    });
  });

  describe('revert on failure without offline support', () => {
    it('reverts an added reaction', async () => {
      const message = buildMessage();
      seed(channel, message);
      vi.spyOn(channel, 'sendReaction').mockRejectedValue(networkError());

      await expect(
        channel.addReactionWithLocalUpdate({
          messageId: message.id,
          reaction: { type: 'love' },
        }),
      ).rejects.toThrow('network down');

      expect(ownReactionTypes(channel.messagePaginator, message.id)).toEqual([]);
    });

    it('restores a removed reaction', async () => {
      const message = buildMessage(['love']);
      seed(channel, message);
      vi.spyOn(channel, 'deleteReaction').mockRejectedValue(networkError());

      await expect(
        channel.deleteReactionWithLocalUpdate({ messageId: message.id, type: 'love' }),
      ).rejects.toThrow('network down');

      expect(ownReactionTypes(channel.messagePaginator, message.id)).toEqual(['love']);
    });

    it('restores the displaced reaction when an enforce_unique add fails', async () => {
      const message = buildMessage(['like']);
      seed(channel, message);
      vi.spyOn(channel, 'sendReaction').mockRejectedValue(networkError());

      await expect(
        channel.addReactionWithLocalUpdate({
          messageId: message.id,
          reaction: { type: 'love' },
          options: { enforce_unique: true },
        }),
      ).rejects.toThrow('network down');

      expect(ownReactionTypes(channel.messagePaginator, message.id)).toEqual(['like']);
    });
  });

  describe('keep-vs-revert with offline support', () => {
    beforeEach(() => {
      enableOfflineDb(client);
    });

    it('keeps the optimistic reaction on a network error (no response)', async () => {
      const message = buildMessage();
      seed(channel, message);
      vi.spyOn(channel, 'sendReaction').mockRejectedValue(networkError());

      await expect(
        channel.addReactionWithLocalUpdate({
          messageId: message.id,
          reaction: { type: 'love' },
        }),
      ).rejects.toThrow();

      expect(ownReactionTypes(channel.messagePaginator, message.id)).toContain('love');
    });

    it('keeps the optimistic reaction when the server responds with a retryable code', async () => {
      const message = buildMessage();
      seed(channel, message);
      vi.spyOn(channel, 'sendReaction').mockRejectedValue(apiError(9));

      await expect(
        channel.addReactionWithLocalUpdate({
          messageId: message.id,
          reaction: { type: 'love' },
        }),
      ).rejects.toThrow();

      expect(ownReactionTypes(channel.messagePaginator, message.id)).toContain('love');
    });

    it('reverts when the server responds with a non-retryable code', async () => {
      const message = buildMessage();
      seed(channel, message);
      vi.spyOn(channel, 'sendReaction').mockRejectedValue(apiError(4));

      await expect(
        channel.addReactionWithLocalUpdate({
          messageId: message.id,
          reaction: { type: 'love' },
        }),
      ).rejects.toThrow();

      expect(ownReactionTypes(channel.messagePaginator, message.id)).toEqual([]);
    });
  });

  describe('offline DB persistence', () => {
    it('writes the reaction row on add and deletes it on a terminal rollback', async () => {
      const db = enableOfflineDb(client);
      const message = buildMessage();
      seed(channel, message);
      vi.spyOn(channel, 'sendReaction').mockRejectedValue(apiError(4));

      await expect(
        channel.addReactionWithLocalUpdate({
          messageId: message.id,
          reaction: { type: 'love' },
        }),
      ).rejects.toThrow();

      expect(db.insertReaction).toHaveBeenCalledTimes(1);
      expect(db.deleteReaction).toHaveBeenCalledTimes(1);
    });

    it('uses updateReaction for enforce_unique and restores the displaced row on rollback', async () => {
      const db = enableOfflineDb(client);
      const message = buildMessage(['like']);
      seed(channel, message);
      vi.spyOn(channel, 'sendReaction').mockRejectedValue(apiError(4));

      await expect(
        channel.addReactionWithLocalUpdate({
          messageId: message.id,
          reaction: { type: 'love' },
          options: { enforce_unique: true },
        }),
      ).rejects.toThrow();

      expect(db.updateReaction).toHaveBeenCalledTimes(1);
      expect(db.deleteReaction).toHaveBeenCalledTimes(1);
      expect(db.insertReaction).toHaveBeenCalledTimes(1);
    });

    it('deletes the row on remove and re-inserts it on rollback', async () => {
      const db = enableOfflineDb(client);
      const message = buildMessage(['love']);
      seed(channel, message);
      vi.spyOn(channel, 'deleteReaction').mockRejectedValue(apiError(4));

      await expect(
        channel.deleteReactionWithLocalUpdate({ messageId: message.id, type: 'love' }),
      ).rejects.toThrow();

      expect(db.deleteReaction).toHaveBeenCalledTimes(1);
      expect(db.insertReaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('show_in_channel fan-out', () => {
    const setupDualHomed = () => {
      const parentId = uuidv4();
      const reply = generateMsg({
        cid: channel.cid,
        parent_id: parentId,
        show_in_channel: true,
      });
      seed(channel, reply);

      const thread = new Thread({
        client,
        channel,
        parentMessage: generateMsg({ cid: channel.cid, id: parentId }),
      });
      thread.messagePaginator.ingestPage({
        isHead: true,
        isTail: true,
        page: [formatMessage(reply)],
        setActive: true,
      });
      client.threads.state.next((current) => ({
        ...current,
        threads: [thread, ...current.threads],
      }));

      return { reply, thread };
    };

    it('mirrors a channel-side reaction onto the thread copy', async () => {
      const { reply, thread } = setupDualHomed();
      vi.spyOn(channel, 'sendReaction').mockResolvedValue(
        apiReactionResponse(generateMsg({ id: reply.id })),
      );

      const pending = channel.addReactionWithLocalUpdate({
        messageId: reply.id,
        reaction: { type: 'love' },
      });

      expect(ownReactionTypes(channel.messagePaginator, reply.id)).toContain('love');
      expect(ownReactionTypes(thread.messagePaginator, reply.id)).toContain('love');

      await pending;
    });

    it('mirrors a thread-side reaction onto the channel copy', async () => {
      const { reply, thread } = setupDualHomed();
      vi.spyOn(channel, 'sendReaction').mockResolvedValue(
        apiReactionResponse(generateMsg({ id: reply.id })),
      );

      const pending = thread.addReactionWithLocalUpdate({
        messageId: reply.id,
        reaction: { type: 'love' },
      });

      expect(ownReactionTypes(thread.messagePaginator, reply.id)).toContain('love');
      expect(ownReactionTypes(channel.messagePaginator, reply.id)).toContain('love');

      await pending;
    });

    it('reverts both copies when the request fails', async () => {
      const { reply, thread } = setupDualHomed();
      vi.spyOn(channel, 'sendReaction').mockRejectedValue(networkError());

      const pending = channel.addReactionWithLocalUpdate({
        messageId: reply.id,
        reaction: { type: 'love' },
      });

      expect(ownReactionTypes(channel.messagePaginator, reply.id)).toContain('love');
      expect(ownReactionTypes(thread.messagePaginator, reply.id)).toContain('love');

      await expect(pending).rejects.toThrow('network down');

      expect(ownReactionTypes(channel.messagePaginator, reply.id)).toEqual([]);
      expect(ownReactionTypes(thread.messagePaginator, reply.id)).toEqual([]);
    });
  });

  describe('thread parent message (own_reactions preservation)', () => {
    const parentOwnReactionTypes = (thread: Thread) =>
      (thread.state.getLatestValue().parentMessage?.own_reactions ?? []).map(
        (r) => r.type,
      );

    const setupParentThread = (ownTypes: string[] = []) => {
      const parentId = uuidv4();
      const thread = new Thread({
        client,
        channel,
        parentMessage: buildMessage(ownTypes, { cid: channel.cid, id: parentId }),
      });
      thread.registerSubscriptions();
      return { parentId, thread };
    };

    it('keeps the user other own_reactions when reacting to the parent (the dropped-reactions bug)', () => {
      const { parentId, thread } = setupParentThread(['like']);

      client.dispatchEvent({
        type: 'reaction.new',
        message: generateMsg({ id: parentId, own_reactions: [] }),
        reaction: ownReaction('love', parentId),
      } as unknown as Event);

      expect(parentOwnReactionTypes(thread)).toEqual(
        expect.arrayContaining(['like', 'love']),
      );
      thread.unregisterSubscriptions();
    });

    it('removes only the un-reacted type from the parent own_reactions', () => {
      const { parentId, thread } = setupParentThread(['like', 'love']);

      client.dispatchEvent({
        type: 'reaction.deleted',
        message: generateMsg({ id: parentId, own_reactions: [] }),
        reaction: ownReaction('love', parentId),
      } as unknown as Event);

      expect(parentOwnReactionTypes(thread)).toEqual(['like']);
      thread.unregisterSubscriptions();
    });

    it('preserves parent own_reactions across an edit (message.updated)', () => {
      const { parentId, thread } = setupParentThread(['love']);

      client.dispatchEvent({
        type: 'message.updated',
        message: generateMsg({ id: parentId, text: 'edited', own_reactions: [] }),
      } as unknown as Event);

      const parent = thread.state.getLatestValue().parentMessage;
      expect(parent?.text).toBe('edited');
      expect(parentOwnReactionTypes(thread)).toEqual(['love']);
      thread.unregisterSubscriptions();
    });
  });

  describe('thread parent message (optimistic reactions)', () => {
    const parentState = (thread: Thread) => thread.state.getLatestValue().parentMessage;
    const parentOwnTypes = (thread: Thread) =>
      (parentState(thread)?.own_reactions ?? []).map((r) => r.type);

    // `registerSubscriptions` seeds the parent into the client-global message store and subscribes
    // `state.parentMessage` to it, so an update to that id anywhere reflects on the thread.
    const setupParentThread = (
      ownTypes: string[] = [],
      { seedInChannel = false }: { seedInChannel?: boolean } = {},
    ) => {
      const parentId = uuidv4();
      const parentMessage = buildMessage(ownTypes, { cid: channel.cid, id: parentId });
      if (seedInChannel) seed(channel, parentMessage);
      const thread = new Thread({ client, channel, parentMessage });
      thread.registerSubscriptions();
      return { parentId, thread };
    };

    it('applies an added reaction to the parent immediately even when the channel has not loaded it', async () => {
      const { parentId, thread } = setupParentThread();
      vi.spyOn(channel, 'sendReaction').mockResolvedValue(
        apiReactionResponse(generateMsg({ id: parentId })),
      );

      const pending = channel.addReactionWithLocalUpdate({
        messageId: parentId,
        reaction: { type: 'love' },
      });

      expect(parentOwnTypes(thread)).toContain('love');
      expect(parentState(thread)?.reaction_groups?.love?.count).toBe(1);
      // the channel never held the parent, so there is no channel-side copy to update
      expect(channel.messagePaginator.getItem(parentId)).toBeUndefined();

      await pending;
    });

    it('mirrors the reaction onto both the channel copy and the thread parent when both hold it', async () => {
      const { parentId, thread } = setupParentThread([], { seedInChannel: true });
      vi.spyOn(channel, 'sendReaction').mockResolvedValue(
        apiReactionResponse(generateMsg({ id: parentId })),
      );

      const pending = channel.addReactionWithLocalUpdate({
        messageId: parentId,
        reaction: { type: 'love' },
      });

      expect(ownReactionTypes(channel.messagePaginator, parentId)).toContain('love');
      expect(parentOwnTypes(thread)).toContain('love');

      await pending;
    });

    it('preserves the user other own_reactions when adding to the parent', async () => {
      const { parentId, thread } = setupParentThread(['like']);
      vi.spyOn(channel, 'sendReaction').mockResolvedValue(
        apiReactionResponse(generateMsg({ id: parentId })),
      );

      const pending = channel.addReactionWithLocalUpdate({
        messageId: parentId,
        reaction: { type: 'love' },
      });

      expect(parentOwnTypes(thread)).toEqual(expect.arrayContaining(['like', 'love']));

      await pending;
    });

    it('replaces the existing own reaction on the parent when enforce_unique is set', async () => {
      const { parentId, thread } = setupParentThread(['like']);
      vi.spyOn(channel, 'sendReaction').mockResolvedValue(
        apiReactionResponse(generateMsg({ id: parentId })),
      );

      const pending = channel.addReactionWithLocalUpdate({
        messageId: parentId,
        reaction: { type: 'love' },
        options: { enforce_unique: true },
      });

      expect(parentOwnTypes(thread)).toEqual(['love']);

      await pending;
    });

    it('removes the own reaction from the parent immediately', async () => {
      const { parentId, thread } = setupParentThread(['love']);
      vi.spyOn(channel, 'deleteReaction').mockResolvedValue(
        apiReactionResponse(generateMsg({ id: parentId })),
      );

      const pending = channel.deleteReactionWithLocalUpdate({
        messageId: parentId,
        type: 'love',
      });

      expect(parentOwnTypes(thread)).toEqual([]);

      await pending;
    });

    it('reverts the parent reaction on a terminal failure', async () => {
      const { parentId, thread } = setupParentThread();
      vi.spyOn(channel, 'sendReaction').mockRejectedValue(networkError());

      const pending = channel.addReactionWithLocalUpdate({
        messageId: parentId,
        reaction: { type: 'love' },
      });

      expect(parentOwnTypes(thread)).toContain('love');

      await expect(pending).rejects.toThrow('network down');

      expect(parentOwnTypes(thread)).toEqual([]);
      expect(parentState(thread)?.reaction_groups?.love).toBeUndefined();
    });
  });
});
