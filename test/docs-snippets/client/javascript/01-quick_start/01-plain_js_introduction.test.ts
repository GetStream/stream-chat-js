import { afterAll, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../../../src';
import { createUserToken, getServerClient } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { getServerUser, sendServerMessage } from '../../../helpers/server';
import { retry } from '../../../helpers/wait';

const PAGE = 'javascript/01-quick_start/01-plain_js_introduction.md';

describe(PAGE, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const apiKey = process.env.STREAM_API_KEY as string;
  const userId = uniqueId('jlahey');
  const channelId = uniqueId('travel');
  // `connectUser` and `watch` create the user and the channel: register them first.
  cleanup.users.push(userId);
  cleanup.channels.push(`messaging:${channelId}`);

  afterAll(async () => {
    await StreamChat.getInstance(apiKey).disconnectUser();
    await cleanup.run();
  });

  it('initializes the client and connects the user', async () => {
    // Start from a fresh singleton.
    Reflect.set(StreamChat, '_instance', undefined);
    const userToken = createUserToken(userId);

    // #region snippet docs="javascript/01-quick_start/01-plain_js_introduction.md" heading="Chat client" tab="JavaScript" index=1
    // COPY: apiKey="{{ api_key }}", userId="jlahey", userToken="{{ chat_user_token }}"
    const client = StreamChat.getInstance(apiKey);
    // you can still use new StreamChat("api_key");

    await client.connectUser(
      {
        id: userId,
        name: 'Jim Lahey',
        image: 'https://i.imgur.com/fR9Jz14.png',
      },
      userToken,
    );
    // #endregion snippet

    expect(client.userID).toBe(userId);
    expect(client.wsConnection?.isHealthy).toBe(true);
    const user = await getServerUser(serverClient, userId);
    expect(user.name).toBe('Jim Lahey');
    expect(user.image).toBe('https://i.imgur.com/fR9Jz14.png');
  });

  it('watches a channel, sends a message and listens to events', async () => {
    // #region snippet docs="javascript/01-quick_start/01-plain_js_introduction.md" heading="Channels" tab="JavaScript" index=1
    // COPY: apiKey="{{ api_key }}", channelId="travel"
    const client = StreamChat.getInstance(apiKey);
    const channel = client.channel('messaging', channelId, {
      name: 'Awesome channel about traveling',
    });

    // fetch the channel state, subscribe to future updates
    const state = await channel.watch();
    // #endregion snippet

    expect(client.userID).toBe(userId);
    expect(state.channel.id).toBe(channelId);
    expect(state.channel.name).toBe('Awesome channel about traveling');
    expect(channel.initialized).toBe(true);

    // #region snippet docs="javascript/01-quick_start/01-plain_js_introduction.md" heading="Messages" tab="JavaScript" index=1
    const text = 'I’m mowing the air Rand, I’m mowing the air.';

    const response = await channel.sendMessage({
      text,
      customField: '123',
    });
    // #endregion snippet

    expect(response.message.text).toBe(text);
    expect(response.message.customField).toBe('123');
    const { message } = await serverClient.chat.getMessage({ id: response.message.id });
    expect(message.custom.customField).toBe('123');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="javascript/01-quick_start/01-plain_js_introduction.md" heading="Events" tab="JavaScript" index=1
      channel.on('message.new', (event) => {
        console.log('received a new message', event.message?.text);
        console.log(`Now have ${channel.state.messages.length} stored in local state`);
      });
      // #endregion snippet

      await sendServerMessage(serverClient, `messaging:${channelId}`, {
        text: 'from the server',
        user_id: userId,
      });

      await retry(() => {
        expect(logSpy).toHaveBeenCalledWith('received a new message', 'from the server');
        expect(logSpy).toHaveBeenCalledWith('Now have 2 stored in local state');
        return Promise.resolve();
      });
    } finally {
      logSpy.mockRestore();
      channel.listeners = {};
    }
  });
});
