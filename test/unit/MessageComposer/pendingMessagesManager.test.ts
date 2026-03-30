import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Channel, LocalMessage, StreamChat } from '../../../src';
import { MessageComposer } from '../../../src/messageComposer/messageComposer';
import { PendingMessagesManager } from '../../../src/messageComposer/pendingMessagesManager';

const user = { id: 'user-id', name: 'User Name' };

const quotedMessage = {
  id: 'quoted-message-id',
  type: 'regular' as const,
  created_at: new Date(),
  deleted_at: null,
  pinned_at: null,
  updated_at: new Date(),
  status: 'received' as const,
  text: 'Quoted message',
  user: { id: 'user-id', name: 'User Name' },
};

const createComposer = (messageId: string) => {
  const client = new StreamChat('test-api-key');
  client.user = user;
  client.userID = user.id;
  const mockChannel = new Channel(client, 'messaging', 'test-channel-id', {
    id: 'test-channel-id',
    type: 'messaging',
    cid: 'messaging:test-channel-id',
  });
  vi.spyOn(mockChannel, 'getClient').mockReturnValue(client);

  const composition: LocalMessage = {
    id: messageId,
    type: 'regular',
    text: 'initial',
    attachments: [
      {
        type: 'image',
        image_url: 'https://example.com/a.png',
      },
    ],
    created_at: new Date(),
    deleted_at: null,
    pinned_at: null,
    status: 'sending',
    updated_at: new Date(),
    mentioned_users: [],
    quoted_message: quotedMessage,
  };

  const composer = new MessageComposer({
    client,
    compositionContext: mockChannel,
    composition,
  });

  composer.textComposer.setText('Hello pending');
  composer.state.partialNext({ showReplyInChannel: true });
  composer.customDataManager.setMessageData({ custom_key: 'custom_value' });

  return { client, composer, mockChannel };
};

describe('PendingMessagesManager', () => {
  let generateIdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    let n = 0;
    generateIdSpy = vi.spyOn(MessageComposer, 'generateId').mockImplementation(() => {
      n += 1;
      return `generated-uuid-${n}`;
    });
  });

  afterEach(() => {
    generateIdSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('addPendingMessage returns a distinct composer with copied state and a new id', () => {
    const { composer: source } = createComposer('optimistic-msg-1');
    const manager = new PendingMessagesManager({ client: source.client });

    const clone = manager.addPendingMessage(source);

    expect(clone).not.toBe(source);
    expect(source.id).toBe('optimistic-msg-1');
    expect(clone.id).not.toBe(source.id);
    expect(clone.textComposer.text).toBe('Hello pending');
    expect(clone.state.getLatestValue().showReplyInChannel).toBe(true);
    expect(clone.state.getLatestValue().quotedMessage?.id).toBe(quotedMessage.id);
    expect(clone.attachmentManager.attachments).toHaveLength(1);
    expect(clone.attachmentManager.attachments[0].image_url).toBe(
      'https://example.com/a.png',
    );
    expect(clone.customDataManager.customMessageData).toEqual(
      expect.objectContaining({ custom_key: 'custom_value' }),
    );
  });

  it('mutating the source after add does not change the stored clone', () => {
    const { composer: source } = createComposer('optimistic-msg-2');
    const manager = new PendingMessagesManager({ client: source.client });
    const clone = manager.addPendingMessage(source);

    source.textComposer.setText('mutated');
    source.customDataManager.setMessageData({ custom_key: 'mutated' });

    expect(clone.textComposer.text).toBe('Hello pending');
    expect(clone.customDataManager.customMessageData).toEqual(
      expect.objectContaining({ custom_key: 'custom_value' }),
    );
  });

  it('removePendingMessage deletes the entry and is safe to call twice', () => {
    const { composer: source } = createComposer('optimistic-msg-3');
    const manager = new PendingMessagesManager({ client: source.client });
    manager.addPendingMessage(source);

    expect(() => manager.removePendingMessage('optimistic-msg-3')).not.toThrow();
    expect(() => manager.removePendingMessage('optimistic-msg-3')).not.toThrow();
  });

  it('addPendingMessage with the same composer id replaces the stored clone', () => {
    const { composer: source } = createComposer('optimistic-msg-4');
    const manager = new PendingMessagesManager({ client: source.client });

    const first = manager.addPendingMessage(source);
    source.textComposer.setText('second snapshot');
    const second = manager.addPendingMessage(source);

    expect(first).not.toBe(second);
    expect(second.textComposer.text).toBe('second snapshot');
  });

  it('StreamChat exposes pendingMessages and clear runs on disconnectUser', async () => {
    const client = new StreamChat('test-api-key');
    expect(client.pendingMessages).toBeInstanceOf(PendingMessagesManager);

    const clearSpy = vi.spyOn(client.pendingMessages, 'clear');
    vi.spyOn(client, 'closeConnection').mockResolvedValue(undefined);

    await client.disconnectUser();

    expect(clearSpy).toHaveBeenCalled();
  });

  it('updates location message_id to the clone composer id when it matched the source', () => {
    const { composer: source } = createComposer('optimistic-msg-5');
    source.locationComposer.state.next({
      location: {
        latitude: 1,
        longitude: 2,
        message_id: source.id,
        created_by_device_id: 'device-1',
      },
    });

    const manager = new PendingMessagesManager({ client: source.client });
    const clone = manager.addPendingMessage(source);

    const loc = clone.locationComposer.state.getLatestValue().location as {
      message_id?: string;
    };
    expect(loc?.message_id).toBe(clone.id);
    expect(loc?.message_id).not.toBe(source.id);
  });
});
