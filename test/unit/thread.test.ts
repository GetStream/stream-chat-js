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

import { Channel, MessageResponse, StreamChat, Thread, ThreadManager, formatMessage } from '../../src';
import sinon from 'sinon';

const TEST_USER_ID = 'observer';

describe('Threads 2.0', () => {
  let client: StreamChat;
  let channelResponse: ReturnType<typeof generateChannel>['channel'];
  let channel: Channel;
  let parentMessageResponse: ReturnType<typeof generateMsg>;
  let thread: Thread;
  let threadManager: ThreadManager;

  beforeEach(() => {
    client = new StreamChat('apiKey');
    client._setUser({ id: TEST_USER_ID });

    channelResponse = generateChannel().channel;
    channel = client.channel(channelResponse.type, channelResponse.id);
    parentMessageResponse = generateMsg();
    thread = new Thread({ client, threadData: generateThread(channelResponse, parentMessageResponse) });
    threadManager = new ThreadManager({ client });
  });

  describe('Thread', () => {
    it('has constructed proper initial state', () => {
      // TODO: id equal to parent message id
      // TODO: read state as dictionary
      // TODO: channel as instance
      // TODO: latest replies formatted
      // TODO: parent message formatted
      // TODO: created_at formatted
      // TODO: deleted_at formatted (or null if not applicable)
      //
    });

    describe('Methods', () => {
      describe('Thread.upsertReply', () => {
        // does not test whether the message has been inserted at the correct position
        // that should be unit-tested separately (addToMessageList utility function)

        it('prevents inserting a new message that does not belong to the associated thread', () => {
          const newMessage = generateMsg();

          const fn = () => {
            thread.upsertReplyLocally({ message: newMessage as MessageResponse });
          };

          expect(fn).to.throw(Error);
        });

        it('inserts a new message that belongs to the associated thread', () => {
          const newMessage = generateMsg({ parent_id: thread.id });

          const { latestReplies } = thread.state.getLatestValue();

          expect(latestReplies).to.have.lengthOf(0);

          thread.upsertReplyLocally({ message: newMessage as MessageResponse });

          expect(thread.state.getLatestValue().latestReplies).to.have.lengthOf(1);
          expect(thread.state.getLatestValue().latestReplies[0].id).to.equal(newMessage.id);
        });

        it('updates existing message', () => {
          const newMessage = formatMessage(generateMsg({ parent_id: thread.id, text: 'aaa' }) as MessageResponse);
          const newMessageCopy = ({ ...newMessage, text: 'bbb' } as unknown) as MessageResponse;

          thread.state.patchedNext('latestReplies', [newMessage]);

          const { latestReplies } = thread.state.getLatestValue();

          expect(latestReplies).to.have.lengthOf(1);
          expect(latestReplies.at(0)!.id).to.equal(newMessageCopy.id);
          expect(latestReplies.at(0)!.text).to.not.equal(newMessageCopy.text);

          thread.upsertReplyLocally({ message: newMessageCopy });

          expect(thread.state.getLatestValue().latestReplies).to.have.lengthOf(1);
          expect(thread.state.getLatestValue().latestReplies.at(0)!.text).to.equal(newMessageCopy.text);
        });

        // TODO: timestampChanged (check that duplicates get removed)
      });

      describe('Thread.partiallyReplaceState', () => {
        it('prevents copying state of the instance with different id', () => {
          const newThread = new Thread({
            client,
            threadData: generateThread(generateChannel({ channel: { id: channelResponse.id } }).channel, generateMsg()),
          });

          expect(thread.id).to.not.equal(newThread.id);

          thread.partiallyReplaceState({ thread: newThread });

          const { read, latestReplies, parentMessage, participants, channelData } = thread.state.getLatestValue();

          // compare non-primitive values only
          expect(read).to.not.equal(newThread.state.getLatestValue().read);
          expect(latestReplies).to.not.equal(newThread.state.getLatestValue().latestReplies);
          expect(parentMessage).to.not.equal(newThread.state.getLatestValue().parentMessage);
          expect(participants).to.not.equal(newThread.state.getLatestValue().participants);
          expect(channelData).to.not.equal(newThread.state.getLatestValue().channelData);
        });

        it('copies state of the instance with the same id', () => {
          const newThread = new Thread({
            client,
            threadData: generateThread(
              generateChannel({ channel: { id: channelResponse.id } }).channel,
              generateMsg({ id: parentMessageResponse.id }),
            ),
          });

          expect(thread.id).to.equal(newThread.id);
          expect(thread).to.not.equal(newThread);

          thread.partiallyReplaceState({ thread: newThread });

          const { read, latestReplies, parentMessage, participants, channelData } = thread.state.getLatestValue();

          // compare non-primitive values only
          expect(read).to.equal(newThread.state.getLatestValue().read);
          expect(latestReplies).to.equal(newThread.state.getLatestValue().latestReplies);
          expect(parentMessage).to.equal(newThread.state.getLatestValue().parentMessage);
          expect(participants).to.equal(newThread.state.getLatestValue().participants);
          expect(channelData).to.equal(newThread.state.getLatestValue().channelData);
        });

        it('appends own failed replies from failedRepliesMap during merging', () => {
          const newThread = new Thread({
            client,
            threadData: generateThread(
              generateChannel({ channel: { id: channelResponse.id } }).channel,
              generateMsg({ id: parentMessageResponse.id }),
              { latest_replies: [generateMsg({ parent_id: parentMessageResponse.id })] },
            ),
          });

          const failedMessage = formatMessage(
            generateMsg({ status: 'failed', parent_id: thread.id }) as MessageResponse,
          );
          thread.upsertReplyLocally({ message: failedMessage });

          expect(thread.id).to.equal(newThread.id);
          expect(thread).to.not.equal(newThread);

          thread.partiallyReplaceState({ thread: newThread });

          const { latestReplies } = thread.state.getLatestValue();

          // compare non-primitive values only
          expect(latestReplies).to.have.lengthOf(2);
          expect(latestReplies.at(-1)!.id).to.equal(failedMessage.id);
          expect(latestReplies).to.not.equal(newThread.state.getLatestValue().latestReplies);
        });
      });

      describe('Thread.incrementOwnUnreadCount', () => {
        it('increments own unread count even if read object is empty', () => {
          const { read } = thread.state.getLatestValue();
          // TODO: write a helper for immediate own unread count
          const ownUnreadCount = read[TEST_USER_ID]?.unread_messages ?? 0;

          expect(ownUnreadCount).to.equal(0);

          thread.incrementOwnUnreadCount();

          expect(thread.state.getLatestValue().read[TEST_USER_ID]?.unread_messages).to.equal(1);
        });

        it("increments own unread count if read object contains current user's record", () => {
          // prepare
          thread.state.patchedNext('read', {
            [TEST_USER_ID]: {
              lastReadAt: new Date(),
              last_read: '',
              last_read_message_id: '',
              unread_messages: 2,
              user: { id: TEST_USER_ID },
            },
          });

          const { read } = thread.state.getLatestValue();
          const ownUnreadCount = read[TEST_USER_ID]?.unread_messages ?? 0;

          expect(ownUnreadCount).to.equal(2);

          thread.incrementOwnUnreadCount();

          expect(thread.state.getLatestValue().read[TEST_USER_ID]?.unread_messages).to.equal(3);
        });
      });

      describe('Thread.deleteReplyLocally', () => {
        // it('');
      });

      describe('Thread.markAsRead', () => {
        let stubbedChannelMarkRead: sinon.SinonStub<Parameters<Channel['markRead']>, ReturnType<Channel['markRead']>>;

        beforeEach(() => {
          stubbedChannelMarkRead = sinon.stub(channel, 'markRead').resolves();
        });

        it('prevents calling channel.markRead if the unread count of the current user is 0', async () => {
          const { read } = thread.state.getLatestValue();
          const ownUnreadCount = read[TEST_USER_ID]?.unread_messages ?? 0;

          expect(ownUnreadCount).to.equal(0);

          await thread.markAsRead();

          expect(stubbedChannelMarkRead.notCalled).to.be.true;
        });

        it('calls channel.markRead if the unread count is greater than zero', async () => {
          // prepare
          thread.incrementOwnUnreadCount();

          const { read } = thread.state.getLatestValue();

          const ownUnreadCount = read[TEST_USER_ID]?.unread_messages ?? 0;

          expect(ownUnreadCount).to.equal(1);

          await thread.markAsRead();

          expect(stubbedChannelMarkRead.calledOnceWith({ thread_id: thread.id })).to.be.true;
        });
      });
    });

    describe('Subscription Handlers', () => {
      beforeEach(() => {
        thread.registerSubscriptions();
      });

      it('calls markAsRead whenever it becomes active or own reply count increases', () => {});

      it('it recovers from stale state whenever it becomes active (or is active and becomes stale)', () => {});

      it('marks own state as stale whenever current user stops watching associated channel', () => {});

      it('properly handles new messages', () => {});

      it('properly handles message updates (both reply and parent)', () => {});
    });
  });

  describe('ThreadManager', () => {
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

    describe('Methods', () => {
      let stubbedQueryThreads: sinon.SinonStub<
        Parameters<StreamChat['queryThreads']>,
        ReturnType<StreamChat['queryThreads']>
      >;

      beforeEach(() => {
        stubbedQueryThreads = sinon.stub(client, 'queryThreads').resolves({
          threads: [],
          next: undefined,
        });
      });

      describe('ThreadManager.reload', () => {
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

        it('new state reflects order of the threads coming from the response', async () => {
          // prepare
          threadManager.state.next((current) => ({ ...current, threads: [thread], unseenThreadIds: ['t1'] }));

          const newThreads = [
            new Thread({
              client,
              threadData: generateThread(channelResponse, generateMsg()),
            }),
            // same thread.id as prepared thread (just changed position in the response and different instance)
            new Thread({
              client,
              threadData: generateThread(channelResponse, parentMessageResponse, {
                thread_participants: [{ id: 'u1' }],
              }),
            }),
            new Thread({
              client,
              threadData: generateThread(channelResponse, generateMsg()),
            }),
          ];

          expect(newThreads[1].id).to.equal(thread.id);
          expect(newThreads[1]).to.not.equal(thread);

          stubbedQueryThreads.resolves({
            threads: newThreads,
            next: undefined,
          });

          await threadManager.reload();

          const { threads, nextCursor, unseenThreadIds } = threadManager.state.getLatestValue();

          expect(nextCursor).to.be.null;
          expect(threads).to.have.lengthOf(3);
          expect(threads[1]).to.equal(thread);
          expect(unseenThreadIds).to.be.empty;
        });
      });

      describe('ThreadManager.loadNextPage', () => {
        it("prevents loading next page if there's no next page to load", async () => {
          expect(threadManager.state.getLatestValue().nextCursor).is.undefined;

          threadManager.state.patchedNext('nextCursor', null);

          await threadManager.loadNextPage();

          expect(stubbedQueryThreads.called).to.be.false;
        });

        it('prevents loading next page if already loading', async () => {
          expect(threadManager.state.getLatestValue().loadingNextPage).is.false;

          threadManager.state.patchedNext('loadingNextPage', true);

          await threadManager.loadNextPage();

          expect(stubbedQueryThreads.called).to.be.false;
        });

        it('switches loading state properly', async () => {
          const spy = sinon.spy();

          threadManager.state.subscribeWithSelector((nextValue) => [nextValue.loadingNextPage], spy, false);

          await threadManager.loadNextPage();

          expect(spy.callCount).to.equal(2);
          expect(spy.firstCall.calledWith([true])).to.be.true;
          expect(spy.lastCall.calledWith([false])).to.be.true;
        });

        it('sets proper nextCursor and threads', async () => {
          threadManager.state.patchedNext('threads', [thread]);

          const newThread = new Thread({
            client,
            threadData: generateThread(channelResponse, generateMsg()),
          });

          stubbedQueryThreads.resolves({
            threads: [newThread],
            next: undefined,
          });

          await threadManager.loadNextPage();

          const { threads, nextCursor } = threadManager.state.getLatestValue();

          expect(threads).to.have.lengthOf(2);
          expect(threads[1]).to.equal(newThread);
          expect(nextCursor).to.be.null;
        });

        it('is called with proper nextCursor and sets new nextCursor', async () => {
          const cursor1 = uuidv4();
          const cursor2 = uuidv4();

          threadManager.state.patchedNext('nextCursor', cursor1);

          stubbedQueryThreads.resolves({
            threads: [],
            next: cursor2,
          });

          await threadManager.loadNextPage();

          const { nextCursor } = threadManager.state.getLatestValue();

          expect(stubbedQueryThreads.calledWithMatch({ next: cursor1 })).to.be.true;
          expect(nextCursor).to.equal(cursor2);
        });
      });
    });
  });
});
