import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../../src';
import type { Channel, MessageResponse } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { waitForChannelTypePropagation } from '../../helpers/wait';

const DOCS = '_default/05-features/09-translation.md';

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const spanishUserId = uniqueId('spanish');
  const languageUserId = uniqueId('language');
  const channelId = uniqueId('general');
  const meltingPotId = uniqueId('melting-pot');
  const pollChannelId = uniqueId('polls');
  // Polls are off for `messaging` in the test app: use a channel type with polls enabled.
  const pollChannelType = uniqueId('polls');
  let client: StreamChat;
  let spanishClient: StreamChat;
  let channel: Channel;
  const languageClient = new StreamChat(process.env.STREAM_API_KEY as string, {
    allowServerSideConnect: true,
  });

  /** Sends a poll from the English user in an auto-translated channel with a Spanish member. */
  const sendPollMessage = async () => {
    await serverClient
      .channel(pollChannelType, pollChannelId, {
        created_by_id: userId,
        members: [userId, spanishUserId],
      })
      .create();
    cleanup.channels.push(`${pollChannelType}:${pollChannelId}`);
    await serverClient
      .channel(pollChannelType, pollChannelId)
      .update({ auto_translation_enabled: true });
    const { poll: createdPoll } = await client.createPoll({
      name: "What's for lunch?",
      options: [{ text: 'Pizza' }, { text: 'Fish' }],
    });
    const { message } = await client
      .channel(pollChannelType, pollChannelId)
      .sendMessage({ text: 'Vote now!', poll_id: createdPoll.id });
    return message;
  };

  beforeAll(async () => {
    cleanup.users.push(userId, spanishUserId, languageUserId);
    // Polls survive their creator's deletion: delete every poll the user created.
    cleanup.add(async () => {
      const { polls } = await serverClient.queryPolls(
        { created_by_id: userId },
        [],
        { limit: 100 },
        userId,
      );
      for (const poll of polls) await serverClient.deletePoll(poll.id, userId);
    });
    await serverClient.createChannelType({ name: pollChannelType, polls: true });
    cleanup.channelTypes.push(pollChannelType);
    await waitForChannelTypePropagation();
    client = await getClientSideClient({ id: userId, language: 'en' });
    spanishClient = await getClientSideClient({ id: spanishUserId, language: 'es' });
    channel = client.channel('messaging', channelId, { members: [userId] });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.watch();
  });

  afterAll(async () => {
    await disconnectClients(client, spanishClient, languageClient);
    await cleanup.run();
  });

  it('translates a message', async () => {
    const messageID = uniqueId('message');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="_default/05-features/09-translation.md" heading="Message Translation Endpoint" tab="JavaScript" index=1
      await channel.sendMessage({
        id: messageID,
        text: 'Hello, I would like to have more information about your product.',
      });

      // returns the message.text translated into French
      const response = await client.translateMessage(messageID, 'fr');

      // the translation will be added to the i18n object
      console.log(response.message.i18n?.fr_text);
      // "Bonjour, J'aimerais avoir plus d'informations sur votre produit.",
      // #endregion snippet

      expect(response.message.id).toBe(messageID);
      expect(response.message.i18n?.language).toBe('en');
      expect(response.message.i18n?.fr_text).toMatch(/produit/);
      expect(log).toHaveBeenCalledWith(response.message.i18n?.fr_text);
      const { message } = await serverClient.getMessage(messageID);
      expect(message.i18n?.fr_text).toBe(response.message.i18n?.fr_text);
    } finally {
      log.mockRestore();
    }
  });

  it('sets the user language', async () => {
    await serverClient.upsertUser({ id: languageUserId });
    const userToken = serverClient.createToken(languageUserId);
    cleanup.channels.push(`messaging:${meltingPotId}`);
    const client = languageClient;

    // #region snippet docs="_default/05-features/09-translation.md" heading="Set user language" tab="JavaScript" index=1
    // COPY: languageUserId="userId", meltingPotId="melting-pot"
    // sets the user language
    await client.connectUser({ id: languageUserId, language: 'en' }, userToken);

    // watch a channel
    await client.channel('messaging', meltingPotId).watch();
    // #endregion snippet

    const { users } = await serverClient.queryUsers({ id: languageUserId });
    expect(users[0]?.language).toBe('en');
    expect(languageClient.activeChannels[`messaging:${meltingPotId}`]?.initialized).toBe(
      true,
    );
    const channels = await serverClient.queryChannels({
      cid: `messaging:${meltingPotId}`,
    });
    expect(channels[0]?.data?.created_by?.id).toBe(languageUserId);
  });

  it('reads poll translations', async () => {
    const sent = await sendPollMessage();
    // the Spanish member reads the message
    const message: MessageResponse = (await spanishClient.getMessage(sent.id)).message;
    const client = spanishClient;

    // #region snippet docs="_default/05-features/09-translation.md" heading="Poll translation" tab="JavaScript" index=1
    const poll = message.poll;
    const language = client.user?.language;

    // Fall back to the original text when a field has no translation for the language
    const name = poll?.name_i18n?.[`${language}_text`] ?? poll?.name;
    const options = poll?.options.map(
      (option) => option.text_i18n?.[`${language}_text`] ?? option.text,
    );
    // #endregion snippet

    expect(language).toBe('es');
    expect(poll?.name_i18n?.language).toBe('en');
    expect(name).toBe(poll?.name_i18n?.es_text);
    expect(name).not.toBe("What's for lunch?");
    expect(options).toHaveLength(2);
    expect(options).toEqual(poll?.options.map((option) => option.text_i18n?.es_text));
  });
});
