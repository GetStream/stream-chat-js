import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Channel, Event } from '../../../../src';
import { StreamChat } from '../../../../src';
import {
  createUserToken,
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { getServerUser } from '../../helpers/server';
import { retry } from '../../helpers/wait';

const apiKey = process.env.STREAM_API_KEY as string;

describe('_default/04-messages/10-message_receipts.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  // Sends the messages and watches the channel for receipt events from the others.
  const observerId = uniqueId('observer');
  // Default privacy settings: positive control for the events.
  const controlId = uniqueId('control');
  const deliveryUserId = uniqueId('john');
  const readUserId = uniqueId('john');
  const channelId = uniqueId('receipts');
  const cid = `messaging:${channelId}`;
  let observer: StreamChat;
  let control: StreamChat;
  let observerChannel: Channel;
  const events: Event[] = [];
  const clients: StreamChat[] = [];

  const newChatClient = () => {
    const chatClient = new StreamChat(apiKey, { allowServerSideConnect: true });
    clients.push(chatClient);
    return chatClient;
  };

  const eventsFrom = (type: string, userId: string) =>
    events.filter((e) => e.type === type && e.user?.id === userId);

  beforeAll(async () => {
    // `connectUser` creates the snippet users, so register them first.
    cleanup.users.push(observerId, controlId, deliveryUserId, readUserId);
    await serverClient.upsertUsers([{ id: deliveryUserId }, { id: readUserId }]);
    observer = await getClientSideClient({ id: observerId });
    control = await getClientSideClient({ id: controlId });
    clients.push(observer, control);
    observerChannel = observer.channel('messaging', channelId, {
      members: [observerId, controlId, deliveryUserId, readUserId],
    });
    cleanup.channels.push(cid);
    await observerChannel.watch();
    observerChannel.on('message.delivered', (e) => events.push(e));
    observerChannel.on('message.read', (e) => events.push(e));
  });

  afterAll(async () => {
    await disconnectClients(...clients);
    await cleanup.run();
  });

  it('disables delivery receipts on connect', async () => {
    const chatClient = newChatClient();
    const userToken = createUserToken(deliveryUserId);

    // #region snippet docs="_default/04-messages/10-message_receipts.md" heading="User Privacy Settings" tab="JavaScript" index=1
    // COPY: deliveryUserId="john", userToken="{{ chat_user_token }}"
    // A client sets its own privacy settings on the user object when connecting
    await chatClient.connectUser(
      {
        id: deliveryUserId,
        privacy_settings: {
          delivery_receipts: {
            enabled: false, // Do not report delivery status
          },
        },
      },
      userToken,
    );
    // #endregion snippet

    const user = await getServerUser(serverClient, deliveryUserId);
    expect(user.privacy_settings?.delivery_receipts?.enabled).toBe(false);

    // The user confirms delivery, then the control user does: only the control's
    // `message.delivered` reaches the other members.
    const { message } = await observerChannel.sendMessage({ text: 'delivered?' });
    const latest_delivered_messages = [{ cid, id: message.id }];
    await chatClient.markChannelsDelivered({ latest_delivered_messages });
    await control.markChannelsDelivered({ latest_delivered_messages });
    await retry(() => {
      expect(eventsFrom('message.delivered', controlId)).toHaveLength(1);
      return Promise.resolve();
    });
    expect(eventsFrom('message.delivered', deliveryUserId)).toHaveLength(0);
  });

  it('disables read receipts on connect', async () => {
    const chatClient = newChatClient();
    const userToken = createUserToken(readUserId);

    // #region snippet docs="_default/04-messages/10-message_receipts.md" heading="User Privacy Settings" tab="JavaScript" index=2
    // COPY: readUserId="john", userToken="{{ chat_user_token }}"
    // A client sets its own privacy settings on the user object when connecting
    await chatClient.connectUser(
      {
        id: readUserId,
        privacy_settings: {
          read_receipts: {
            enabled: false, // Do not report read status
          },
        },
      },
      userToken,
    );
    // #endregion snippet

    const user = await getServerUser(serverClient, readUserId);
    expect(user.privacy_settings?.read_receipts?.enabled).toBe(false);

    // The user reads the channel, then the control user does: only the control's
    // `message.read` reaches the other members.
    await observerChannel.sendMessage({ text: 'read?' });
    const readerChannel = chatClient.channel('messaging', channelId);
    await readerChannel.watch();
    const controlChannel = control.channel('messaging', channelId);
    await controlChannel.watch();
    await readerChannel.markRead();
    await controlChannel.markRead();
    await retry(() => {
      expect(eventsFrom('message.read', controlId).length).toBeGreaterThan(0);
      return Promise.resolve();
    });
    expect(eventsFrom('message.read', readUserId)).toHaveLength(0);
  });
});
