import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StreamChat } from '../../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../../helpers/clients';
import { Cleanup } from '../../../../helpers/cleanup';
import { uniqueId } from '../../../../helpers/ids';
import { deletePollsCreatedBy } from '../../../../helpers/server';
import { retry, waitForChannelTypePropagation } from '../../../../helpers/wait';

const DOCS = 'chat/javascript/06-state/10-polls.md';

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('polls');
  // Polls are off for `messaging` in the test app: use a channel type with polls enabled.
  const channelType = uniqueId('polls');
  const pollName = uniqueId('poll');
  let client: StreamChat;
  let pollId: string;
  let messageId: string;
  let optionId: string;

  beforeAll(async () => {
    cleanup.users.push(userId);
    cleanup.add(() => deletePollsCreatedBy(serverClient, userId));
    await serverClient.chat.createChannelType({
      name: channelType,
      automod: 'disabled',
      automod_behavior: 'flag',
      max_message_length: 5000,
      polls: true,
    });
    cleanup.channelTypes.push(channelType);
    await waitForChannelTypePropagation();

    // Create the poll on another client, so this page's client hasn't loaded it
    const setupClient = await getClientSideClient({ id: userId });
    const setupChannel = setupClient.channel(channelType, channelId, {
      members: [{ user_id: userId }],
    });
    cleanup.channels.push(`${channelType}:${channelId}`);
    await setupChannel.watch();
    const { poll } = await setupClient.createPoll({
      name: pollName,
      options: [{ text: 'A' }, { text: 'B' }],
    });
    const { message } = await setupChannel.sendMessage({
      message: { text: 'Vote!', poll_id: poll.id },
    });
    pollId = poll.id;
    messageId = message.id;
    optionId = poll.options[0].id;
    await disconnectClients(setupClient);

    client = await getClientSideClient({ id: userId });
  });

  afterAll(async () => {
    client.polls.unregisterSubscriptions();
    await disconnectClients(client);
    await cleanup.run();
  });

  it('fetches a poll', async () => {
    expect(client.polls.fromState(pollId)).toBeUndefined();

    // #region snippet docs="chat/javascript/06-state/10-polls.md" heading="Initialization" tab="JavaScript" index=1
    client.polls.registerSubscriptions();

    // A poll that isn't loaded yet: fetches it
    const poll = await client.polls.getPoll(pollId);
    // #endregion snippet

    expect(poll?.id).toBe(pollId);
    expect(client.polls.fromState(pollId)).toBe(poll);
  });

  it('reads a poll', () => {
    // #region snippet docs="chat/javascript/06-state/10-polls.md" heading="Reading" tab="JavaScript" index=1
    // A loaded poll, `undefined` if it isn't loaded
    const pollInstance = client.polls.fromState(pollId);

    const { name, options, vote_counts_by_option, ownVotesByOptionId, is_closed } =
      pollInstance?.state.getLatestValue() ?? {};
    // #endregion snippet

    expect(name).toBe(pollName);
    expect(options?.map((option) => option.text)).toEqual(['A', 'B']);
    expect(vote_counts_by_option ?? {}).toEqual({});
    expect(ownVotesByOptionId).toEqual({});
    // Omitted by the API until the poll is closed
    expect(is_closed ?? false).toBe(false);
  });

  it('subscribes to a poll', async () => {
    // Watching the channel delivers its poll events
    await client.channel(channelType, channelId).watch();
    const pollInstance = client.polls.fromState(pollId);
    const renderVotes = vi.fn();

    // #region snippet docs="chat/javascript/06-state/10-polls.md" heading="Reading" tab="JavaScript" index=2
    const unsubscribe = pollInstance?.state.subscribeWithSelector(
      (state) => ({ vote_counts_by_option: state.vote_counts_by_option }),
      ({ vote_counts_by_option }) => renderVotes(vote_counts_by_option),
    );
    // #endregion snippet

    try {
      expect(unsubscribe).toBeDefined();
      await client.castPollVote(
        { message_id: messageId, poll_id: pollId },
        { vote: { option_id: optionId } },
      );
      await retry(() => {
        expect(renderVotes).toHaveBeenLastCalledWith({ [optionId]: 1 });
        return Promise.resolve();
      });
    } finally {
      unsubscribe?.();
    }
  });
});
