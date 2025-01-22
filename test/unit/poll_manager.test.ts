import { expect } from 'chai';

import { generateMsg } from './test-utils/generateMessage';
import { mockChannelQueryResponse } from './test-utils/mockChannelQueryResponse';

import sinon from 'sinon';
import {
  EventTypes,
  FormatMessageResponse,
  MessageResponse,
  Poll,
  PollManager,
  PollResponse,
  StreamChat,
} from '../../src';

const TEST_USER_ID = 'observer';

let client: StreamChat;
let pollManager: PollManager;

// TODO: probably extract this elsewhere
const generatePollMessage = (
  pollId: string,
  extraData: Partial<PollResponse> = {},
  messageOverrides: Partial<MessageResponse> = {},
) => {
  const user1 = {
    id: 'admin',
    role: 'admin',
    created_at: '2022-03-08T09:46:56.840739Z',
    updated_at: '2024-09-13T13:53:32.883409Z',
    last_active: '2024-10-23T08:14:23.299448386Z',
    banned: false,
    online: true,
    mutes: null,
    name: 'Test User',
  };

  const user1Votes = [
    {
      poll_id: pollId,
      id: '332da4fe-e38c-465c-8f74-e8df69680f13',
      option_id: '85610252-7d50-429c-8183-51a7eba46246',
      user_id: user1.id,
      user: user1,
      created_at: '2024-10-22T15:58:27.756166Z',
      updated_at: '2024-10-22T15:58:27.756166Z',
    },
    {
      poll_id: pollId,
      id: '5657da00-256e-41fc-a580-b7adabcbfbe1',
      option_id: 'dc22dcd6-4fc8-4c92-92c2-bfd63245724c',
      user_id: user1.id,
      user: user1,
      created_at: '2024-10-22T15:58:25.886491Z',
      updated_at: '2024-10-22T15:58:25.886491Z',
    },
  ];

  const user2 = {
    id: 'SmithAnne',
    role: 'user',
    created_at: '2022-01-27T08:28:28.412254Z',
    updated_at: '2024-09-26T10:12:23.427141Z',
    last_active: '2024-10-23T08:01:43.157632831Z',
    banned: false,
    online: true,
    nickname: 'Ann',
    name: 'SmithAnne',
    image: 'https://getstream.io/random_png/?name=SmithAnne',
  };

  const user2Votes = [
    {
      poll_id: pollId,
      id: 'f428f353-3057-4353-b0b5-b33dcdeb1992',
      option_id: '7312e983-b042-4596-b5ce-f9e82deb363f',
      user_id: user2.id,
      user: user2,
      created_at: '2024-10-22T16:00:50.2493Z',
      updated_at: '2024-10-22T16:00:50.2493Z',
    },
    {
      poll_id: pollId,
      id: '75ba8774-bf17-4edd-8ced-39e7dc6aa7dd',
      option_id: 'ba933470-c0da-4b6f-a4d2-d2176ac0d4a8',
      user_id: user2.id,
      user: user2,
      created_at: '2024-10-22T16:00:54.410474Z',
      updated_at: '2024-10-22T16:00:54.410474Z',
    },
  ];

  const user1Answer = {
    poll_id: pollId,
    id: 'dbb4506c-c5a8-4ca6-86ec-0c57498916fe',
    option_id: '',
    is_answer: true,
    answer_text: 'comment1',
    user_id: user1.id,
    user: user1,
    created_at: '2024-10-23T13:12:57.944913Z',
    updated_at: '2024-10-23T13:12:57.944913Z',
  };

  const pollResponse = {
    id: pollId,
    name: 'XY',
    description: '',
    voting_visibility: 'public',
    enforce_unique_vote: false,
    max_votes_allowed: 2,
    allow_user_suggested_options: false,
    allow_answers: true,
    vote_count: 4,
    options: [
      {
        id: '85610252-7d50-429c-8183-51a7eba46246',
        text: 'A',
      },
      {
        id: '7312e983-b042-4596-b5ce-f9e82deb363f',
        text: 'B',
      },
      {
        id: 'ba933470-c0da-4b6f-a4d2-d2176ac0d4a8',
        text: 'C',
      },
      {
        id: 'dc22dcd6-4fc8-4c92-92c2-bfd63245724c',
        text: 'D',
      },
    ],
    vote_counts_by_option: {
      '7312e983-b042-4596-b5ce-f9e82deb363f': 1,
      '85610252-7d50-429c-8183-51a7eba46246': 2,
      'dc22dcd6-4fc8-4c92-92c2-bfd63245724c': 1,
    },
    answers_count: 1,
    latest_votes_by_option: {
      'dc22dcd6-4fc8-4c92-92c2-bfd63245724c': [user1Votes[0]],
      '7312e983-b042-4596-b5ce-f9e82deb363f': [user2Votes[0]],
      '85610252-7d50-429c-8183-51a7eba46246': [user1Votes[1], user2Votes[1]],
    },
    latest_answers: [user1Answer],
    own_votes: [...user1Votes, user1Answer],
    created_by_id: user1.id,
    created_by: user1,
    created_at: '2024-10-22T15:28:20.580523Z',
    updated_at: '2024-10-22T15:28:20.580523Z',
    ...extraData,
  };

  return generateMsg({ poll_id: pollId, poll: pollResponse, ...messageOverrides });
};
const generateRandomMessagesWithPolls = (size: number = 5, prefix: string = '') => {
  const messages = [];
  const pollMessages = [];
  for (let pi = 0; pi < size; pi++) {
    let message = generateMsg();
    if (Math.random() >= 0.5) {
      message = generatePollMessage(`poll_${prefix}${pi}`);
      pollMessages.push(message);
    }
    messages.push(message);
  }

  return { messages, pollMessages };
};

describe('PollManager', () => {
  beforeEach(() => {
    client = new StreamChat('apiKey');
    client._setUser({ id: TEST_USER_ID });
    pollManager = new PollManager({ client });
    pollManager.registerSubscriptions();
  });

  afterEach(() => {
    pollManager.unregisterSubscriptions();
    sinon.restore();
  });

  describe('Initialization and pollCache hydration', () => {
    it('initializes properly', () => {
      expect(pollManager.data).to.be.empty;
      expect(client.polls.data).to.be.empty;
      expect(client.polls.data).not.to.be.null;
    });

    it('populates pollCache on client.hydrateActiveChannels', async () => {
      const mockedChannelsQueryResponse = [];

      let pollMessages: MessageResponse[] = [];
      for (let ci = 0; ci < 2; ci++) {
        const { messages, pollMessages: onlyPollMessages } = generateRandomMessagesWithPolls(5, `_${ci}`);
        pollMessages = pollMessages.concat(onlyPollMessages);
        mockedChannelsQueryResponse.push({
          ...mockChannelQueryResponse,
          messages,
        });
      }

      client.hydrateActiveChannels(mockedChannelsQueryResponse);

      expect(client.polls.data.size).to.equal(pollMessages.length);
      // Map.prototype.keys() preserves the insertion order so we can do this
      expect(Array.from(client.polls.data.keys())).to.deep.equal(pollMessages.map((m) => m.poll_id));
    });

    it('prevents pollCache population if caching is disabled', async () => {
      client._cacheEnabled = () => false;
      const mockedChannelsQueryResponse = [];

      let pollMessages: MessageResponse[] = [];
      for (let ci = 0; ci < 2; ci++) {
        const { messages, pollMessages: onlyPollMessages } = generateRandomMessagesWithPolls(5, `_${ci}`);
        pollMessages = pollMessages.concat(onlyPollMessages);
        mockedChannelsQueryResponse.push({
          ...mockChannelQueryResponse,
          messages,
        });
      }

      client.hydrateActiveChannels(mockedChannelsQueryResponse);

      expect(client.polls.data.size).to.equal(0);
    });

    it('populates pollCache when the message.new event is fired', () => {
      client.dispatchEvent({
        type: 'message.new',
        message: generateMsg({ user: { id: 'bob' } }),
        user: { id: 'bob' },
      });

      const pollMessage = generatePollMessage('poll_from_event', {}, { user: { id: 'bob' } });

      client.dispatchEvent({
        type: 'message.new',
        message: pollMessage,
        user: { id: 'bob' },
      });

      expect(pollManager.data.size).to.equal(1);
      expect(pollManager.fromState('poll_from_event')?.id).to.equal('poll_from_event');

      client.dispatchEvent({
        type: 'message.new',
        message: pollMessage,
        user: { id: 'bob' },
      });

      // do not duplicate if it's been sent again, for example in a different channel;
      // the state should be shared.
      expect(pollManager.data.size).to.equal(1);
    });

    it('correctly hydrates the poll cache', () => {
      const { messages, pollMessages } = generateRandomMessagesWithPolls(5);

      pollManager.hydratePollCache(messages);

      expect(pollManager.data.size).to.equal(pollMessages.length);
      expect(Array.from(pollManager.data.keys())).to.deep.equal(pollMessages.map((m) => m.poll_id));
    });

    it('correctly upserts duplicate polls within the cache', () => {
      const { messages, pollMessages } = generateRandomMessagesWithPolls(5);
      const duplicateId = 'poll_duplicate';
      let duplicatePollMessage = generatePollMessage(duplicateId);

      pollManager.hydratePollCache([...messages, duplicatePollMessage]);

      const finalLength = pollMessages.length + 1;

      // normal initialization
      expect(pollManager.data.size).to.equal(finalLength);
      expect(Array.from(pollManager.data.keys())).to.deep.equal(
        [...pollMessages, duplicatePollMessage].map((m) => m.poll_id),
      );
      expect(pollManager.fromState(duplicateId)?.data.name).to.equal(duplicatePollMessage.poll.name);

      // many duplicate messages
      const duplicates = [];
      for (let di = 0; di < 5; di++) {
        const newDuplicateMessage = generatePollMessage(duplicateId, { name: `d1_${di}` });
        duplicates.push(newDuplicateMessage);
      }

      // without overwriteState
      pollManager.hydratePollCache(duplicates);

      expect(pollManager.data.size).to.equal(finalLength);
      expect(Array.from(pollManager.data.keys())).to.deep.equal(
        [...pollMessages, duplicatePollMessage].map((m) => m.poll_id),
      );
      expect(pollManager.fromState(duplicateId)?.data.name).to.equal('XY');

      // with overwriteState
      pollManager.hydratePollCache(duplicates, true);

      expect(pollManager.data.size).to.equal(finalLength);
      expect(Array.from(pollManager.data.keys())).to.deep.equal(
        [...pollMessages, duplicatePollMessage].map((m) => m.poll_id),
      );
      expect(pollManager.fromState(duplicateId)?.data.name).to.equal('d1_4');

      // many hydrate invocations
      for (let di = 0; di < 5; di++) {
        const newDuplicateMessage = generatePollMessage(duplicateId, { name: `d2_${di}` });
        pollManager.hydratePollCache([newDuplicateMessage], true);
      }

      expect(pollManager.data.size).to.equal(finalLength);
      expect(Array.from(pollManager.data.keys())).to.deep.equal(
        [...pollMessages, duplicatePollMessage].map((m) => m.poll_id),
      );
      expect(pollManager.fromState(duplicateId)?.data.name).to.equal('d2_4');
    });
  });
  describe('Event handling', () => {
    const pollId1 = 'poll_1';
    const pollId2 = 'poll_2';
    let pollMessage1: FormatMessageResponse;
    let pollMessage2: FormatMessageResponse;

    beforeEach(() => {
      pollMessage1 = generatePollMessage(pollId1);
      pollMessage2 = generatePollMessage(pollId2);
      pollManager.hydratePollCache([pollMessage1, pollMessage2]);
    });

    it('should not register subscription handlers twice', () => {
      pollManager.registerSubscriptions();

      const pollClosedStub = sinon.stub(pollManager.fromState(pollId1) as Poll, 'handlePollClosed');

      client.dispatchEvent({
        type: 'poll.closed',
        poll: pollMessage1.poll as PollResponse,
      });

      expect(pollClosedStub.calledOnce).to.be.true;
    });

    it('should not call subscription handlers if unregisterSubscriptions has been called', () => {
      pollManager.unregisterSubscriptions();

      const voteCastedStub = sinon.stub(pollManager.fromState(pollId1) as Poll, 'handleVoteCasted');
      const pollClosedStub = sinon.stub(pollManager.fromState(pollId1) as Poll, 'handlePollClosed');

      const poll = pollMessage1.poll as PollResponse;

      client.dispatchEvent({
        type: 'poll.vote_casted',
        poll,
      });

      client.dispatchEvent({
        type: 'poll.closed',
        poll,
      });

      expect(voteCastedStub.calledOnce).to.be.false;
      expect(pollClosedStub.calledOnce).to.be.false;
    });

    it('should update the correct poll within the cache on poll.updated', () => {
      const updatedTitle = 'Updated title';
      const spy1 = sinon.spy(pollManager.fromState(pollId1) as Poll, 'handlePollUpdated');
      const spy2 = sinon.spy(pollManager.fromState(pollId2) as Poll, 'handlePollUpdated');

      const updatedPoll = { ...pollMessage1.poll, name: updatedTitle } as PollResponse;

      client.dispatchEvent({
        type: 'poll.updated',
        poll: updatedPoll,
      });

      expect(spy1.calledOnce).to.be.true;
      expect(spy1.getCall(0).args[0].type).to.equal('poll.updated');
      expect(spy1.getCall(0).args[0].poll).to.equal(updatedPoll);
      expect(spy2.calledOnce).to.be.false;
    });

    const eventHandlerPairs = [
      ['poll.closed', 'handlePollClosed'],
      ['poll.vote_casted', 'handleVoteCasted'],
      ['poll.vote_changed', 'handleVoteChanged'],
      ['poll.vote_removed', 'handleVoteRemoved'],
    ];

    eventHandlerPairs.map(([eventType, handlerName]) => {
      it(`should invoke poll.${handlerName} within the cache on ${eventType}`, () => {
        const stub1 = sinon.stub(pollManager.fromState(pollId1) as Poll, handlerName as keyof Poll);
        const stub2 = sinon.stub(pollManager.fromState(pollId2) as Poll, handlerName as keyof Poll);

        const updatedPoll = pollMessage1.poll as PollResponse;

        client.dispatchEvent({
          type: eventType as EventTypes,
          poll: updatedPoll,
        });

        expect(stub1.calledOnce).to.be.true;
        expect(stub1.getCall(0).args[0].type).to.equal(eventType);
        expect(stub1.getCall(0).args[0].poll).to.equal(updatedPoll);
        expect(stub2.calledOnce).to.be.false;
      });
    });
  });
  describe('API', () => {
    const pollId1 = 'poll_1';
    const pollId2 = 'poll_2';
    let stubbedQueryPolls: sinon.SinonStub<Parameters<StreamChat['queryPolls']>, ReturnType<StreamChat['queryPolls']>>;
    let stubbedGetPoll: sinon.SinonStub<Parameters<StreamChat['getPoll']>, ReturnType<StreamChat['getPoll']>>;
    const pollMessage1: PollResponse = generatePollMessage(pollId1);
    const pollMessage2: PollResponse = generatePollMessage(pollId2);
    beforeEach(() => {
      stubbedQueryPolls = sinon
        .stub(client, 'queryPolls')
        .resolves({ polls: [pollMessage1.poll as PollResponse, pollMessage2.poll as PollResponse], duration: '10' });
      stubbedGetPoll = sinon
        .stub(client, 'getPoll')
        .resolves({ poll: pollMessage1.poll as PollResponse, duration: '10' });
    });
    it('should return a Poll instance on queryPolls', async () => {
      const { polls } = await pollManager.queryPolls({}, {}, {});

      expect(polls).to.have.lengthOf(2);
      polls.forEach((poll) => {
        expect(poll).to.be.instanceof(Poll);
      });
      expect(stubbedQueryPolls.calledOnce).to.be.true;
    });
    it('should properly populate the pollCache on queryPolls', async () => {
      const { polls } = await pollManager.queryPolls({}, {}, {});

      expect(pollManager.data.size).to.equal(2);
      expect(pollManager.fromState(pollId1)).to.not.be.undefined;
      expect(pollManager.fromState(pollId2)).to.not.be.undefined;
      // each poll should keep the same reference
      polls.forEach((poll) => {
        if (poll?.id) {
          expect(pollManager.fromState(poll?.id)).to.equal(poll);
        }
      });
    });
    it('should overwrite the state if polls from queryPolls are already present in the cache', async () => {
      const duplicatePollMessage = generatePollMessage(pollId1, { title: 'SHOULD CHANGE' });
      pollManager.hydratePollCache([duplicatePollMessage]);

      const previousPollFromCache = pollManager.fromState(pollId1);

      const { polls } = await pollManager.queryPolls({}, {}, {});

      const pollFromQuery = polls[0];

      expect(pollManager.data.size).to.equal(2);
      expect(pollManager.fromState(pollId1)).to.not.be.undefined;
      expect(pollManager.fromState(pollId1)?.data.name).to.equal('XY');
      expect(pollManager.fromState(pollId2)).to.not.be.undefined;
      // maintain referential integrity
      expect(pollManager.fromState(pollId1)).to.equal(previousPollFromCache);
      expect(pollManager.fromState(pollId1)).to.equal(pollFromQuery);
    });
    it('should return a Poll instance on getPoll', async () => {
      const poll = await pollManager.getPoll(pollId1);

      expect(poll).to.be.instanceof(Poll);
      expect(stubbedGetPoll.calledOnce).to.be.true;
    });
    it('should properly populate the pollCache on getPoll', async () => {
      const poll = await pollManager.getPoll(pollId1);

      expect(pollManager.data.size).to.equal(1);
      expect(pollManager.fromState(pollId1)).to.not.be.undefined;
      // should have the same reference
      expect(pollManager.fromState(pollId1)).to.equal(poll);
    });
    it('should overwrite the state if the poll returned from getPoll is present in the cache', async () => {
      const duplicatePollMessage = generatePollMessage(pollId1, { title: 'SHOULD CHANGE' });
      pollManager.hydratePollCache([duplicatePollMessage]);

      const previousPollFromCache = pollManager.fromState(pollId1);

      const poll = await pollManager.getPoll(pollId1);

      expect(pollManager.data.size).to.equal(1);
      expect(pollManager.fromState(pollId1)).to.not.be.undefined;
      expect(pollManager.fromState(pollId1)?.data.name).to.equal('XY');
      // maintain referential integrity
      expect(pollManager.fromState(pollId1)).to.equal(previousPollFromCache);
      expect(pollManager.fromState(pollId1)).to.equal(poll);
    });
  });
});
