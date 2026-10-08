import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, CreatePollData, PollAnswer, StreamChat } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { deletePollsCreatedBy } from '../../helpers/server';
import { waitForChannelTypePropagation } from '../../helpers/wait';

const DOCS = '_default/05-features/07-polls_api.md';

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('general');
  // Polls are off for `messaging` in the test app: use a channel type with polls enabled.
  const channelType = uniqueId('polls');
  let client: StreamChat;
  let channel: Channel;

  /** Creates a poll as the connected user and sends it in a message. */
  const sendPoll = async (data: Partial<CreatePollData> = {}) => {
    const { poll } = await client.createPoll({
      name: uniqueId('poll'),
      options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
      ...data,
    });
    const { message } = await channel.sendMessage({ text: 'Vote!', poll_id: poll.id });
    return {
      poll,
      pollId: poll.id,
      messageId: message.id,
      optionIds: poll.options.map((option) => option.id),
    };
  };

  const getServerPoll = async (pollId: string) =>
    (await serverClient.getPoll({ poll_id: pollId, user_id: userId })).poll;

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
    client = await getClientSideClient({ id: userId });
    channel = client.channel(channelType, channelId, { members: [userId] });
    cleanup.channels.push(`${channelType}:${channelId}`);
    await channel.watch();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('polls at a quick glance', async () => {
    const { messageId, pollId, optionIds } = await sendPoll();
    const firstOptionId = optionIds[0];
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="_default/05-features/07-polls_api.md" heading="Polls at a Quick Glance" tab="JavaScript" index=1
      // COPY: firstOptionId="option-id"
      // Create a poll and send it in a message
      const { poll } = await client.createPoll({
        name: 'Where should we host our next event?',
        options: [{ text: 'Amsterdam' }, { text: 'Boulder' }],
      });
      await channel.sendMessage({ text: 'Vote now!', poll_id: poll.id });

      // Vote on a poll
      await client.castPollVote(messageId, pollId, { option_id: firstOptionId });

      // Retrieve poll results
      const { poll: retrievedPoll } = await client.getPoll(pollId);
      console.log(retrievedPoll.vote_counts_by_option); // { 'option-id': 5 }
      // #endregion snippet

      expect(poll.options.map((option) => option.text)).toEqual(['Amsterdam', 'Boulder']);
      const { messages } = await channel.query({ messages: { limit: 5 } });
      expect(messages.at(-1)?.poll_id).toBe(poll.id);
      expect(retrievedPoll.vote_counts_by_option[firstOptionId]).toBe(1);
      expect(log).toHaveBeenCalledWith({ [firstOptionId]: 1 });
    } finally {
      log.mockRestore();
    }
  });

  it('creates a poll and sends it as part of a message', async () => {
    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Creating a poll and sending it as part of a message" tab="JavaScript" index=1
    const { poll } = await client.createPoll({
      name: 'Where should we host our next company event?',
      options: [
        {
          text: 'Amsterdam, The Netherlands',
        },
        {
          text: 'Boulder, CO',
        },
      ],
    });

    // or if you're using PollManager

    const pollInstance = await client.polls.createPoll({
      name: 'Where should we host our next company event?',
      options: [
        {
          text: 'Amsterdam, The Netherlands',
        },
        {
          text: 'Boulder, CO',
        },
      ],
    });

    const { message } = await channel.sendMessage({
      text: 'We want to know your opinion!',
      poll_id: poll.id,
    });

    // message.poll contains all relevant poll data
    // #endregion snippet

    expect(poll.name).toBe('Where should we host our next company event?');
    expect(pollInstance?.data.name).toBe('Where should we host our next company event?');
    expect(pollInstance?.data.options).toHaveLength(2);
    expect(message.poll_id).toBe(poll.id);
    expect(message.poll?.id).toBe(poll.id);
  });

  it('creates a poll with custom properties', async () => {
    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Poll options" tab="JavaScript" index=1
    const poll = await client.createPoll({
      name: 'Where should we host our next company event?',
      options: [
        {
          text: 'Amsterdam, The Netherlands',
          foo: 'bar',
        },
        {
          text: 'Boulder, CO',
          foo: 'baz',
        },
      ],
      foo: 'bar',
    });
    // #endregion snippet

    expect(poll.poll).toMatchObject({ foo: 'bar' });
    expect(poll.poll.options[0]).toMatchObject({ foo: 'bar' });
    expect(poll.poll.options[1]).toMatchObject({ foo: 'baz' });
  });

  it('casts votes on options', async () => {
    const { messageId, pollId, optionIds } = await sendPoll();
    const [firstOptionId, optionId] = optionIds;
    const chatClient = client;
    // Load the poll into the PollManager cache, as rendering the channel would.
    await chatClient.polls.getPoll(pollId);

    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Send vote on option" tab="JavaScript" index=1
    // COPY: firstOptionId="some-option-id-328904342"
    const { vote } = await chatClient.castPollVote(messageId, pollId, {
      option_id: firstOptionId,
    });

    // or if you're using the reactive poll instance
    const pollInstance = chatClient.polls.fromState(pollId);
    const response = await pollInstance?.castVote(optionId, messageId);
    // #endregion snippet

    expect(vote.option_id).toBe(firstOptionId);
    expect(response?.vote.option_id).toBe(optionId);
    const serverPoll = await getServerPoll(pollId);
    expect(serverPoll.vote_counts_by_option).toEqual({
      [firstOptionId]: 1,
      [optionId]: 1,
    });
  });

  it('sends answers', async () => {
    const { messageId, pollId } = await sendPoll({ allow_answers: true });
    const chatClient = client;
    await chatClient.polls.getPoll(pollId);
    const answerText = 'Somewhere sunny';

    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Send an answer (if answers are configured to be allowed)" tab="JavaScript" index=1
    const { vote } = await chatClient.castPollVote(messageId, pollId, {
      answer_text: 'some-option-id-328904342',
    });

    // or if you're using the reactive poll instance
    const pollInstance = chatClient.polls.fromState(pollId);
    const response = await pollInstance?.addAnswer(answerText, messageId);
    // #endregion snippet

    expect((vote as PollAnswer).answer_text).toBe('some-option-id-328904342');
    expect((response?.vote as PollAnswer | undefined)?.answer_text).toBe(answerText);
    // Adding an answer replaces the previous one.
    const serverPoll = await getServerPoll(pollId);
    expect(serverPoll.answers_count).toBe(1);
    expect(serverPoll.latest_answers.map((answer) => answer.answer_text)).toEqual([
      answerText,
    ]);
  });

  it('removes votes', async () => {
    const { messageId, pollId, optionIds } = await sendPoll();
    const chatClient = client;
    const {
      vote: { id: voteId },
    } = await chatClient.castPollVote(messageId, pollId, { option_id: optionIds[0] });
    const {
      vote: { id: anotherVoteId },
    } = await chatClient.castPollVote(messageId, pollId, { option_id: optionIds[1] });
    await chatClient.polls.getPoll(pollId);

    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Removing a vote" tab="JavaScript" index=1
    const { vote } = await chatClient.removePollVote(messageId, pollId, voteId);

    // or if you're using the reactive poll instance
    const pollInstance = chatClient.polls.fromState(pollId);
    const response = await pollInstance?.removeVote(anotherVoteId, messageId);
    // #endregion snippet

    expect(vote.id).toBe(voteId);
    expect(response).toBeDefined();
    const serverPoll = await getServerPoll(pollId);
    expect(serverPoll.vote_count).toBe(0);
  });

  it('closes polls', async () => {
    const { pollId } = await sendPoll();
    const chatClient = client;
    await chatClient.polls.getPoll(pollId);
    const closePoll = vi.spyOn(chatClient, 'closePoll');

    try {
      // #region snippet docs="_default/05-features/07-polls_api.md" heading="Closing a poll" tab="JavaScript" index=1
      await chatClient.closePoll(pollId);

      // or if you're using the reactive poll instance
      const pollInstance = chatClient.polls.fromState(pollId);
      await pollInstance?.close();
      // #endregion snippet

      expect(closePoll).toHaveBeenCalled();
      expect(pollInstance?.data.is_closed).toBe(true);
      expect((await getServerPoll(pollId)).is_closed).toBe(true);
    } finally {
      closePoll.mockRestore();
    }
  });

  it('retrieves a poll', async () => {
    const { pollId } = await sendPoll();
    const chatClient = client;

    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Retrieving a poll" tab="JavaScript" index=1
    const poll = await chatClient.getPoll(pollId);

    // or if you're using PollManager
    await chatClient.polls.getPoll(pollId);
    // note that in this case the poll will be returned by
    // the cache first and fetched only if it isn't there
    // #endregion snippet

    expect(poll.poll.id).toBe(pollId);
    expect(chatClient.polls.fromState(pollId)?.id).toBe(pollId);
  });

  it('fully updates a poll', async () => {
    const {
      pollId,
      optionIds: [option1Id, option2Id],
    } = await sendPoll();
    const chatClient = client;

    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Full update" tab="JavaScript" index=1
    const updatedPoll = await chatClient.updatePoll({
      id: pollId,
      name: 'Where should we not go to?',
      options: [
        {
          id: option1Id,
          text: 'Amsterdam, The Netherlands',
          foo: 'bar',
        },
        {
          id: option2Id,
          text: 'Boulder, CO',
          foo: 'baz',
        },
      ],
    });
    // #endregion snippet

    expect(updatedPoll.poll.name).toBe('Where should we not go to?');
    expect(updatedPoll.poll.options).toMatchObject([
      { id: option1Id, text: 'Amsterdam, The Netherlands', foo: 'bar' },
      { id: option2Id, text: 'Boulder, CO', foo: 'baz' },
    ]);
  });

  it('partially updates a poll', async () => {
    const { pollId } = await sendPoll({ custom_property: 'value' });
    const chatClient = client;

    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Partial update" tab="JavaScript" index=1
    const updatedPoll = await chatClient.partialUpdatePoll(pollId, {
      set: { name: 'Where should we not go to?' },
      unset: ['custom_property'],
    });
    // #endregion snippet

    expect(updatedPoll.poll.name).toBe('Where should we not go to?');
    expect(updatedPoll.poll).not.toHaveProperty('custom_property');
  });

  it('deletes polls', async () => {
    const { pollId } = await sendPoll();
    const { pollId: anotherPollId } = await sendPoll();
    const chatClient = client;
    await chatClient.polls.getPoll(anotherPollId);

    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Deleting a poll" tab="JavaScript" index=1
    await chatClient.deletePoll(pollId);

    // or if you're using the reactive poll instance
    const pollInstance = chatClient.polls.fromState(anotherPollId);
    await pollInstance?.delete();
    // #endregion snippet

    expect(pollInstance).toBeDefined();
    await expect(getServerPoll(pollId)).rejects.toThrow();
    await expect(getServerPoll(anotherPollId)).rejects.toThrow();
  });

  it('adds poll options', async () => {
    const { pollId } = await sendPoll();
    const chatClient = client;
    await chatClient.polls.getPoll(pollId);

    // #region snippet docs="_default/05-features/07-polls_api.md" heading="**Add poll option**" tab="JavaScript" index=1
    const pollOption = await chatClient.createPollOption(pollId, {
      text: 'Another option',
    });

    // or if you're using the reactive poll instance
    const pollInstance = chatClient.polls.fromState(pollId);
    const anotherPollOption = await pollInstance?.createOption({
      text: 'Yet another option',
    });
    // #endregion snippet

    expect(pollOption.poll_option.text).toBe('Another option');
    expect(anotherPollOption?.poll_option.text).toBe('Yet another option');
    const serverPoll = await getServerPoll(pollId);
    expect(serverPoll.options).toHaveLength(5);
  });

  it('updates poll options', async () => {
    const {
      pollId,
      optionIds: [optionId],
    } = await sendPoll();
    const chatClient = client;
    await chatClient.polls.getPoll(pollId);

    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Update poll option" tab="JavaScript" index=1
    const updatedPollOption = await chatClient.updatePollOption(pollId, {
      id: optionId,
      text: 'Updated option',
      my_custom_property: 'my_custom_value',
    });

    // or if you're using the reactive poll instance
    const pollInstance = chatClient.polls.fromState(pollId);
    const pollOption = await pollInstance?.updateOption({
      id: optionId,
      text: 'Updated option again',
    });
    // #endregion snippet

    expect(updatedPollOption.poll_option).toMatchObject({
      id: optionId,
      text: 'Updated option',
      my_custom_property: 'my_custom_value',
    });
    expect(pollOption?.poll_option).toMatchObject({
      id: optionId,
      text: 'Updated option again',
    });
  });

  it('deletes poll options', async () => {
    const {
      pollId,
      optionIds: [optionId, anotherOptionId],
    } = await sendPoll();
    const chatClient = client;
    await chatClient.polls.getPoll(pollId);

    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Delete poll option" tab="JavaScript" index=1
    await chatClient.deletePollOption(pollId, optionId);

    // or if you're using the reactive poll instance
    const pollInstance = chatClient.polls.fromState(pollId);
    await pollInstance?.deleteOption(anotherOptionId);
    // #endregion snippet

    expect(pollInstance).toBeDefined();
    const serverPoll = await getServerPoll(pollId);
    expect(serverPoll.options.map((option) => option.id)).not.toContain(optionId);
    expect(serverPoll.options.map((option) => option.id)).not.toContain(anotherOptionId);
    expect(serverPoll.options).toHaveLength(1);
  });

  it('queries votes', async () => {
    const { poll, messageId, optionIds } = await sendPoll();
    const [option1Id, option2Id, option3Id] = optionIds;
    const chatClient = client;
    for (const option_id of [option1Id, option2Id, option3Id]) {
      await chatClient.castPollVote(messageId, poll.id, { option_id });
    }

    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Querying votes" tab="JavaScript" index=1
    // retrieve all votes on either option1Id or option2Id
    const filter = {
      option_id: { $in: [option1Id, option2Id] },
    };
    const { votes } = await chatClient.queryPollVotes(poll.id, filter);
    // #endregion snippet

    expect(votes.map((vote) => vote.option_id).sort()).toEqual(
      [option1Id, option2Id].sort(),
    );
  });

  it('queries polls', async () => {
    const { pollId: closedPollId } = await sendPoll();
    const { pollId: openPollId } = await sendPoll();
    await client.closePoll(closedPollId);
    const chatClient = client;

    // #region snippet docs="_default/05-features/07-polls_api.md" heading="Querying polls" tab="JavaScript" index=1
    // retrieve all polls that are closed for voting sorted by created_at
    const { polls } = await chatClient.queryPolls({ is_closed: true }, [
      { created_at: -1 },
    ]);

    // or if you're using PollManager
    const { polls: pollInstances } = await chatClient.polls.queryPolls(
      { is_closed: true },
      [{ created_at: -1 }],
    );
    // the returned polls will be ones with reactive state
    // #endregion snippet

    const ids = polls.map((poll) => poll.id);
    expect(ids).toContain(closedPollId);
    expect(ids).not.toContain(openPollId);
    expect(polls.every((poll) => poll.is_closed)).toBe(true);
    expect(pollInstances.map((poll) => poll?.id)).toEqual(ids);
    expect(pollInstances.every((poll) => poll?.data.is_closed)).toBe(true);
  });
});
