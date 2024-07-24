import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';

import { generateChannel } from './test-utils/generateChannel';
import { generateMember } from './test-utils/generateMember';
import { generateMsg } from './test-utils/generateMessage';
import { generateUser } from './test-utils/generateUser';
import { getClientWithUser } from './test-utils/getClient';
import { getOrCreateChannelApi } from './test-utils/getOrCreateChannelApi';
import { mockChannelQueryResponse } from './test-utils/mockChannelQueryResponse';
import { generateThread } from './test-utils/generateThread';

import { ChannelState, EventTypes, MessageResponse, StreamChat, Thread, ThreadManager } from '../../src';
import sinon from 'sinon';

const TEST_USER_ID = 'observer';

describe('Thread', () => {
  describe('addReply', async () => {
    // TODO: test thread state merging but in Thread instead

    // let client;
    // let channel;
    // let parent;
    // let thread;
    // beforeEach(() => {
    // 	client = new StreamChat('apiKey');
    // 	client.userID = 'observer';
    // 	channel = generateChannel().channel;
    // 	parent = generateMsg();
    // 	thread = new Thread({ client, threadData: generateThread(channel, parent) });
    // });
    // it('should throw error if the message is not a reply to the parent', async () => {
    // 	const reply = generateMsg({
    // 		status: 'pending',
    // 		parent_id: 'some_other_id',
    // 	});
    // 	expect(() => thread.addReply(reply)).to.throw('Message does not belong to this thread');
    // });
    // it('should add reply to the thread', async () => {
    // 	const reply1 = generateMsg({
    // 		status: 'pending',
    // 		parent_id: parent.id,
    // 	});
    // 	thread.addReply(reply1);
    // 	expect(thread.latestReplies).to.have.length(1);
    // 	expect(thread.latestReplies[0].status).to.equal('pending');
    // 	reply1.status = 'received';
    // 	thread.addReply(reply1);
    // 	expect(thread.latestReplies).to.have.length(1);
    // 	expect(thread.latestReplies[0].status).to.equal('received');
    // 	const reply2 = generateMsg({
    // 		status: 'pending',
    // 		parent_id: parent.id,
    // 	});
    // 	thread.addReply(reply2);
    // 	expect(thread.latestReplies).to.have.length(2);
    // 	expect(thread.latestReplies[1].status).to.equal('pending');
    // 	reply2.status = 'received';
    // 	thread.addReply(reply2);
    // 	expect(thread.latestReplies).to.have.length(2);
    // 	expect(thread.latestReplies[1].status).to.equal('received');
    // });
  });
});

describe('ThreadManager', () => {
  let client: StreamChat;
  let channelResponse: ReturnType<typeof generateChannel>['channel'];
  let parentMessageResponse: ReturnType<typeof generateMsg>;
  let thread: Thread;
  let threadManager: ThreadManager;

  beforeEach(() => {
    client = new StreamChat('apiKey');
    client.userID = TEST_USER_ID;
    client.user = { id: TEST_USER_ID };
    channelResponse = generateChannel().channel;
    parentMessageResponse = generateMsg();
    thread = new Thread({ client, threadData: generateThread(channelResponse, parentMessageResponse) });
    threadManager = new ThreadManager({ client });
  });

  //   describe('Initial State', () => {
  //     // check initial state
  //   });

  describe('Subscription Handlers', () => {
    beforeEach(() => {
      threadManager.registerSubscriptions();
    });

    ([
      ['health.check', 2],
      ['notification.mark_read', 1],
      ['notification.thread_message_new', 8],
      ['notification.channel_deleted', 11],
    ] as const).forEach(([eventType, unreadCount]) => {
      it(`unreadThreadsCount changes on ${eventType}`, () => {
        client.dispatchEvent({ received_at: new Date().toISOString(), type: eventType, unread_threads: unreadCount });

        const { unreadThreadsCount } = threadManager.state.getLatestValue();

        expect(unreadThreadsCount).to.eq(unreadCount);
      });
    });

    describe('Event notification.thread_message_new', () => {
      it('does not fill the unseenThreadIds array if threads have not been loaded yet', () => {
        expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;
        expect(threadManager.state.getLatestValue().nextCursor).to.be.undefined;

        client.dispatchEvent({
          received_at: new Date().toISOString(),
          type: 'notification.thread_message_new',
          message: generateMsg({ parent_id: uuidv4() }) as MessageResponse,
        });

        expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;
      });

      it('adds parentMessageId to the unseenThreadIds array on notification.thread_message_new', () => {
        // artificial first page load
        threadManager.state.patchedNext('nextCursor', null);

        expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;

        const parentMessageId = uuidv4();

        client.dispatchEvent({
          received_at: new Date().toISOString(),
          type: 'notification.thread_message_new',
          message: generateMsg({ parent_id: parentMessageId }) as MessageResponse,
        });

        expect(threadManager.state.getLatestValue().unseenThreadIds).to.have.lengthOf(1);
      });

      it('skips duplicate parentMessageIds in unseenThreadIds array', () => {
        // artificial first page load
        threadManager.state.patchedNext('nextCursor', null);

        expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;

        const parentMessageId = uuidv4();

        client.dispatchEvent({
          received_at: new Date().toISOString(),
          type: 'notification.thread_message_new',
          message: generateMsg({ parent_id: parentMessageId }) as MessageResponse,
        });

        client.dispatchEvent({
          received_at: new Date().toISOString(),
          type: 'notification.thread_message_new',
          message: generateMsg({ parent_id: parentMessageId }) as MessageResponse,
        });

        expect(threadManager.state.getLatestValue().unseenThreadIds).to.have.lengthOf(1);
      });

      it('skips if thread (parentMessageId) is already loaded within threads array', () => {
        // artificial first page load
        threadManager.state.patchedNext('threads', [thread]);

        expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;

        client.dispatchEvent({
          received_at: new Date().toISOString(),
          type: 'notification.thread_message_new',
          message: generateMsg({ parent_id: thread.id }) as MessageResponse,
        });

        expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;
      });
    });

    it('recovers from connection down', () => {
      threadManager.state.patchedNext('threads', [thread]);

      client.dispatchEvent({
        received_at: new Date().toISOString(),
        type: 'connection.changed',
        online: false,
      });

      const { lastConnectionDownAt } = threadManager.state.getLatestValue();

      expect(lastConnectionDownAt).to.be.a('date');

      // mock client.sync
      const stub = sinon.stub(client, 'sync').resolves();

      client.dispatchEvent({
        received_at: new Date().toISOString(),
        type: 'connection.recovered',
      });

      expect(stub.calledWith([thread.channel!.cid], lastConnectionDownAt?.toISOString())).to.be.true;

      // TODO: simulate .sync fail, check re-query called
    });

    it('always calls reload on ThreadManager activation', () => {
      const stub = sinon.stub(threadManager, 'reload').resolves();

      threadManager.activate();

      expect(stub.called).to.be.true;
    });

    it('should generate a new threadIdIndexMap on threads array change', () => {
      expect(threadManager.state.getLatestValue().threadIdIndexMap).to.deep.equal({});

      threadManager.state.patchedNext('threads', [thread]);

      expect(threadManager.state.getLatestValue().threadIdIndexMap).to.deep.equal({ [thread.id]: 0 });
    });
  });

  describe('ThreadManager.reload & ThreadManager.loadNextPage Method', () => {
    let stubbedQueryThreads: sinon.SinonStub<
      Parameters<typeof client.queryThreads>,
      ReturnType<typeof client.queryThreads>
    >;

    beforeEach(() => {
      stubbedQueryThreads = sinon.stub(client, 'queryThreads').resolves({
        threads: [],
        next: undefined,
      });
    });

    it('skips reload if unseenThreadIds array is empty', async () => {
      await threadManager.reload();

      expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;
      expect(stubbedQueryThreads.notCalled).to.be.true;
    });

    it('has been called with proper limits', async () => {
      threadManager.state.next((current) => ({ ...current, threads: [thread], unseenThreadIds: ['t1'] }));

      await threadManager.reload();

      expect(stubbedQueryThreads.calledWith({ limit: 2 })).to.be.true;
    });

    it('adds new thread if it does not exist within the threads array', async () => {
      threadManager.state.patchedNext('unseenThreadIds', ['t1']);

      stubbedQueryThreads.resolves({
        threads: [thread],
        next: undefined,
      });

      await threadManager.reload();

      const { threads, nextCursor, unseenThreadIds } = threadManager.state.getLatestValue();

      expect(nextCursor).to.be.null;
      expect(threads).to.contain(thread);
      expect(unseenThreadIds).to.be.empty;
    });

    // TODO: test merge but instance is the same!
    it('replaces state of the existing thread which reports stale state within the threads array', async () => {
      // prepare
      threadManager.state.next((current) => ({ ...current, threads: [thread], unseenThreadIds: ['t1'] }));
      thread.state.patchedNext('isStateStale', true);

      const newThread = new Thread({
        client,
        threadData: generateThread(channelResponse, parentMessageResponse, { thread_participants: [{ id: 'u1' }] }),
      });

      expect(thread.state.getLatestValue().participants).to.have.lengthOf(0);
      expect(newThread.id).to.equal(thread.id);
      expect(newThread).to.not.equal(thread);

      stubbedQueryThreads.resolves({
        threads: [newThread],
        next: undefined,
      });

      await threadManager.reload();

      const { threads, nextCursor, unseenThreadIds } = threadManager.state.getLatestValue();

      expect(nextCursor).to.be.null;
      expect(threads).to.have.lengthOf(1);
      expect(threads).to.contain(thread);
      expect(unseenThreadIds).to.be.empty;
      expect(thread.state.getLatestValue().participants).to.have.lengthOf(1);
    });

    // TODO: reload construct new threads with order returned from response

    // ThreadManager.loadNextPage
    // TODO: check queryThreads not called if already loading or nothing more to load
    // TODO: check nextCursor & threads are set properly
    // TODO: check queryThreads is called with proper nextCursor
  });
});
