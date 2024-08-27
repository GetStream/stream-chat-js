import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';

import { generateChannel } from './test-utils/generateChannel';
import { generateMsg } from './test-utils/generateMessage';
import { generateThread } from './test-utils/generateThread';

import sinon from 'sinon';
import {
  Channel,
  ChannelResponse,
  MessageResponse,
  StreamChat,
  Thread,
  ThreadManager,
  ThreadResponse,
} from '../../src';

const TEST_USER_ID = 'observer';

describe('Threads 2.0', () => {
  let client: StreamChat;
  let channelResponse: ChannelResponse;
  let channel: Channel;
  let parentMessageResponse: MessageResponse;
  let threadManager: ThreadManager;

  function createTestThread({
    channelOverrides = {},
    parentMessageOverrides = {},
    ...overrides
  }: Partial<ThreadResponse> & {
    channelOverrides?: Partial<ChannelResponse>;
    parentMessageOverrides?: Partial<MessageResponse>;
  } = {}) {
    return new Thread({
      client,
      threadData: generateThread(
        { ...channelResponse, ...channelOverrides },
        { ...parentMessageResponse, ...parentMessageOverrides },
        overrides,
      ),
    });
  }

  beforeEach(() => {
    client = new StreamChat('apiKey');
    client._setUser({ id: TEST_USER_ID });
    channelResponse = generateChannel({ channel: { id: uuidv4() } }).channel as ChannelResponse;
    channel = client.channel(channelResponse.type, channelResponse.id);
    parentMessageResponse = generateMsg() as MessageResponse;
    threadManager = new ThreadManager({ client });
  });

  describe.only('Thread', () => {
    it('initializes properly', () => {
      const thread = new Thread({ client, threadData: generateThread(channelResponse, parentMessageResponse) });
      expect(thread.id).to.equal(parentMessageResponse.id);
    });

    describe('Methods', () => {
      describe('upsertReplyLocally', () => {
        it('prevents inserting a new message that does not belong to the associated thread', () => {
          const thread = createTestThread();
          const message = generateMsg() as MessageResponse;
          expect(() => thread.upsertReplyLocally({ message })).to.throw();
        });

        it('inserts a new message that belongs to the associated thread', () => {
          const thread = createTestThread();
          const message = generateMsg({ parent_id: thread.id }) as MessageResponse;
          const stateBefore = thread.state.getLatestValue();
          expect(stateBefore.replies).to.have.lengthOf(0);

          thread.upsertReplyLocally({ message });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.replies).to.have.lengthOf(1);
          expect(stateAfter.replies[0].id).to.equal(message.id);
        });

        it('updates existing message', () => {
          const message = generateMsg({ parent_id: parentMessageResponse.id, text: 'aaa' }) as MessageResponse;
          const thread = createTestThread({ latest_replies: [message] });
          const udpatedMessage = { ...message, text: 'bbb' };

          const stateBefore = thread.state.getLatestValue();
          expect(stateBefore.replies).to.have.lengthOf(1);
          expect(stateBefore.replies[0].id).to.equal(message.id);
          expect(stateBefore.replies[0].text).to.not.equal(udpatedMessage.text);

          thread.upsertReplyLocally({ message: udpatedMessage });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.replies).to.have.lengthOf(1);
          expect(stateAfter.replies[0].text).to.equal(udpatedMessage.text);
        });

        it('updates optimistically added message', () => {
          const optimisticMessage = generateMsg({
            parent_id: parentMessageResponse.id,
            text: 'aaa',
            date: '2020-01-01T00:00:00Z',
          }) as MessageResponse;

          const message = generateMsg({
            parent_id: parentMessageResponse.id,
            text: 'bbb',
            date: '2020-01-01T00:00:10Z',
          }) as MessageResponse;

          const thread = createTestThread({ latest_replies: [optimisticMessage, message] });
          const udpatedMessage = { ...optimisticMessage, text: 'ccc', date: '2020-01-01T00:00:20Z' };

          const stateBefore = thread.state.getLatestValue();
          expect(stateBefore.replies).to.have.lengthOf(2);
          expect(stateBefore.replies[0].id).to.equal(optimisticMessage.id);
          expect(stateBefore.replies[0].text).to.equal('aaa');
          expect(stateBefore.replies[1].id).to.equal(message.id);

          thread.upsertReplyLocally({ message: udpatedMessage, timestampChanged: true });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.replies).to.have.lengthOf(2);
          expect(stateAfter.replies[0].id).to.equal(message.id);
          expect(stateAfter.replies[1].id).to.equal(optimisticMessage.id);
          expect(stateAfter.replies[1].text).to.equal('ccc');
        });
      });

      describe('updateParentMessageLocally', () => {
        it('prevents updating a parent message if the ids do not match', () => {
          const thread = createTestThread();
          const message = generateMsg() as MessageResponse;
          expect(() => thread.updateParentMessageLocally(message)).to.throw();
        });

        it('updates parent message and related top-level properties', () => {
          const thread = createTestThread();

          const stateBefore = thread.state.getLatestValue();
          expect(stateBefore.deletedAt).to.be.null;
          expect(stateBefore.replyCount).to.equal(0);
          expect(stateBefore.parentMessage.text).to.equal(parentMessageResponse.text);

          const updatedMessage = generateMsg({
            id: parentMessageResponse.id,
            text: 'aaa',
            reply_count: 10,
            deleted_at: new Date().toISOString(),
          }) as MessageResponse;

          thread.updateParentMessageLocally(updatedMessage);

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.deletedAt).to.be.not.null;
          expect(stateAfter.deletedAt!.toISOString()).to.equal(updatedMessage.deleted_at);
          expect(stateAfter.replyCount).to.equal(updatedMessage.reply_count);
          expect(stateAfter.parentMessage.text).to.equal(updatedMessage.text);
        });
      });

      describe('updateParentMessageOrReplyLocally', () => {
        it('updates reply if the message has a matching parent id', () => {
          const thread = createTestThread();
          const message = generateMsg({ parent_id: thread.id }) as MessageResponse;
          const upsertReplyLocallyStub = sinon.stub(thread, 'upsertReplyLocally');
          const updateParentMessageLocallyStub = sinon.stub(thread, 'updateParentMessageLocally');

          thread.updateParentMessageOrReplyLocally(message);

          expect(upsertReplyLocallyStub.called).to.be.true;
          expect(updateParentMessageLocallyStub.called).to.be.false;
        });

        it('updates parent message if the message has a matching id and is not a reply', () => {
          const thread = createTestThread();
          const message = generateMsg({ id: thread.id }) as MessageResponse;
          const upsertReplyLocallyStub = sinon.stub(thread, 'upsertReplyLocally');
          const updateParentMessageLocallyStub = sinon.stub(thread, 'updateParentMessageLocally');

          thread.updateParentMessageOrReplyLocally(message);

          expect(upsertReplyLocallyStub.called).to.be.false;
          expect(updateParentMessageLocallyStub.called).to.be.true;
        });

        it('does nothing if the message is unrelated to the thread', () => {
          const thread = createTestThread();
          const message = generateMsg() as MessageResponse;
          const upsertReplyLocallyStub = sinon.stub(thread, 'upsertReplyLocally');
          const updateParentMessageLocallyStub = sinon.stub(thread, 'updateParentMessageLocally');

          thread.updateParentMessageOrReplyLocally(message);

          expect(upsertReplyLocallyStub.called).to.be.false;
          expect(updateParentMessageLocallyStub.called).to.be.false;
        });
      });

      describe('hydrateState', () => {
        it('prevents hydrating state from the instance with a different id', () => {
          const thread = createTestThread();
          const otherThread = createTestThread({ parentMessageOverrides: { id: uuidv4() } });

          expect(thread.id).to.not.equal(otherThread.id);
          expect(() => thread.hydrateState(otherThread)).to.throw();
        });

        it('copies state of the instance with the same id', () => {
          const thread = createTestThread();
          const hydrationThread = createTestThread();
          thread.hydrateState(hydrationThread);

          const stateAfter = thread.state.getLatestValue();
          const hydrationState = hydrationThread.state.getLatestValue();

          // compare non-primitive values only
          expect(stateAfter.read).to.equal(hydrationState.read);
          expect(stateAfter.replies).to.equal(hydrationState.replies);
          expect(stateAfter.parentMessage).to.equal(hydrationState.parentMessage);
          expect(stateAfter.participants).to.equal(hydrationState.participants);
        });

        it('retains failed replies after hydration', () => {
          const thread = createTestThread();
          const hydrationThread = createTestThread({
            latest_replies: [generateMsg({ parent_id: parentMessageResponse.id }) as MessageResponse],
          });

          const failedMessage = generateMsg({
            status: 'failed',
            parent_id: parentMessageResponse.id,
          }) as MessageResponse;
          thread.upsertReplyLocally({ message: failedMessage });

          thread.hydrateState(hydrationThread);

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.replies).to.have.lengthOf(2);
          expect(stateAfter.replies[1].id).to.equal(failedMessage.id);
        });
      });

      describe('deleteReplyLocally', () => {
        it('deletes appropriate message', () => {
          const createdAt = new Date().getTime();
          // five messages "created" second apart
          const messages = Array.from(
            { length: 5 },
            (_, i) => generateMsg({ created_at: new Date(createdAt + 1000 * i).toISOString() }) as MessageResponse,
          );
          const thread = createTestThread({ latest_replies: messages });

          const stateBefore = thread.state.getLatestValue();
          expect(stateBefore.replies).to.have.lengthOf(5);

          const messageToDelete = generateMsg({
            created_at: messages[2].created_at,
            id: messages[2].id,
          }) as MessageResponse;

          thread.deleteReplyLocally({ message: messageToDelete });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.replies).to.not.equal(stateBefore.replies);
          expect(stateAfter.replies).to.have.lengthOf(4);
          expect(stateAfter.replies.find((reply) => reply.id === messageToDelete.id)).to.be.undefined;
        });
      });

      describe('markAsRead', () => {
        let stubbedChannelMarkRead: sinon.SinonStub<Parameters<Channel['markRead']>, ReturnType<Channel['markRead']>>;

        beforeEach(() => {
          stubbedChannelMarkRead = sinon.stub(channel, 'markRead').resolves();
        });

        it('does nothing if unread count of the current user is zero', async () => {
          const thread = createTestThread();
          expect(thread.ownUnreadCount).to.equal(0);

          await thread.markAsRead();

          expect(stubbedChannelMarkRead.notCalled).to.be.true;
        });

        it('calls channel.markRead if unread count of the current user is greater than zero', async () => {
          const thread = createTestThread({
            read: [
              {
                last_read: new Date().toISOString(),
                user: { id: TEST_USER_ID },
                unread_messages: 42,
              },
            ],
          });

          expect(thread.ownUnreadCount).to.equal(42);

          await thread.markAsRead();

          expect(stubbedChannelMarkRead.calledOnceWith({ thread_id: thread.id })).to.be.true;
        });
      });

      describe('loadPage', () => {
        it('sets up pagination on initialization (all replies included in response)', () => {
          const thread = createTestThread({ latest_replies: [generateMsg() as MessageResponse], reply_count: 1 });
          const state = thread.state.getLatestValue();
          expect(state.pagination.prevCursor).to.be.null;
          expect(state.pagination.nextCursor).to.be.null;
        });

        it('sets up pagination on initialization (not all replies included in response)', () => {
          const firstMessage = generateMsg() as MessageResponse;
          const lastMessage = generateMsg() as MessageResponse;
          const thread = createTestThread({ latest_replies: [firstMessage, lastMessage], reply_count: 3 });
          const state = thread.state.getLatestValue();
          expect(state.pagination.prevCursor).not.to.be.null;
          expect(state.pagination.nextCursor).not.to.be.null;
        });

        it('updates pagination after loading next page (end reached)', async () => {
          const thread = createTestThread({
            latest_replies: [generateMsg(), generateMsg()] as MessageResponse[],
            reply_count: 3,
          });
          sinon.stub(thread, 'queryReplies').resolves({
            messages: [generateMsg()] as MessageResponse[],
            duration: '',
          });

          await thread.loadPage(2);

          const state = thread.state.getLatestValue();
          expect(state.pagination.nextCursor).to.be.null;
        });

        it('updates pagination after loading next page (end not reached)', async () => {
          const thread = createTestThread({
            latest_replies: [generateMsg(), generateMsg()] as MessageResponse[],
            reply_count: 4,
          });
          const lastMessage = generateMsg() as MessageResponse;
          sinon.stub(thread, 'queryReplies').resolves({
            messages: [generateMsg(), lastMessage] as MessageResponse[],
            duration: '',
          });

          await thread.loadPage(2);

          const state = thread.state.getLatestValue();
          expect(state.pagination.nextCursor).to.equal(lastMessage.id);
        });

        it('forms correct request when loading next page', async () => {
          const firstMessage = generateMsg() as MessageResponse;
          const lastMessage = generateMsg() as MessageResponse;
          const thread = createTestThread({ latest_replies: [firstMessage, lastMessage], reply_count: 3 });
          const queryRepliesStub = sinon.stub(thread, 'queryReplies').resolves({ messages: [], duration: '' });

          await thread.loadPage(42);

          expect(
            queryRepliesStub.calledOnceWith({
              id_gt: lastMessage.id,
              limit: 42,
            }),
          ).to.be.true;
        });

        it('updates pagination after loading previous page (end reached)', async () => {
          const thread = createTestThread({
            latest_replies: [generateMsg(), generateMsg()] as MessageResponse[],
            reply_count: 3,
          });
          sinon.stub(thread, 'queryReplies').resolves({
            messages: [generateMsg()] as MessageResponse[],
            duration: '',
          });

          await thread.loadPage(-2);

          const state = thread.state.getLatestValue();
          expect(state.pagination.prevCursor).to.be.null;
        });

        it('updates pagination after loading previous page (end not reached)', async () => {
          const thread = createTestThread({
            latest_replies: [generateMsg(), generateMsg()] as MessageResponse[],
            reply_count: 4,
          });
          const firstMessage = generateMsg() as MessageResponse;
          sinon.stub(thread, 'queryReplies').resolves({
            messages: [firstMessage, generateMsg()] as MessageResponse[],
            duration: '',
          });

          await thread.loadPage(-2);

          const state = thread.state.getLatestValue();
          expect(state.pagination.prevCursor).to.equal(firstMessage.id);
        });

        it('forms correct request when loading previous page', async () => {
          const firstMessage = generateMsg() as MessageResponse;
          const lastMessage = generateMsg() as MessageResponse;
          const thread = createTestThread({ latest_replies: [firstMessage, lastMessage], reply_count: 3 });
          const queryRepliesStub = sinon.stub(thread, 'queryReplies').resolves({ messages: [], duration: '' });

          await thread.loadPage(-42);

          expect(
            queryRepliesStub.calledOnceWith({
              id_lt: firstMessage.id,
              limit: 42,
            }),
          ).to.be.true;
        });
      });
    });

    describe('Subscription and Event Handlers', () => {
      it('marks active channel as read', () => {
        const thread = createTestThread({
          read: [
            {
              last_read: new Date().toISOString(),
              user: { id: TEST_USER_ID },
              unread_messages: 42,
            },
          ],
        });
        thread.registerSubscriptions();

        const stateBefore = thread.state.getLatestValue();
        const stubbedMarkAsRead = sinon.stub(thread, 'markAsRead').resolves();
        expect(stateBefore.active).to.be.false;
        expect(thread.ownUnreadCount).to.equal(42);
        expect(stubbedMarkAsRead.called).to.be.false;

        thread.activate();

        const stateAfter = thread.state.getLatestValue();
        expect(stateAfter.active).to.be.true;
        expect(stubbedMarkAsRead.calledOnce).to.be.true;

        client.dispatchEvent({
          type: 'message.new',
          message: generateMsg({ parent_id: thread.id, user: { id: 'bob' } }) as MessageResponse,
          user: { id: 'bob' },
        });

        expect(stubbedMarkAsRead.calledTwice).to.be.true;

        thread.unregisterSubscriptions();
      });

      it('reloads stale state when thread is active', async () => {
        const thread = createTestThread();
        thread.registerSubscriptions();

        const stateBefore = thread.state.getLatestValue();
        const stubbedGetThread = sinon
          .stub(client, 'getThread')
          .resolves(createTestThread({ latest_replies: [generateMsg() as MessageResponse] }));

        thread.state.partialNext({ isStateStale: true });

        expect(thread.hasStaleState).to.be.true;
        expect(stubbedGetThread.called).to.be.false;

        thread.activate();

        expect(stubbedGetThread.calledOnce).to.be.true;
        await stubbedGetThread.firstCall.returnValue;
        const stateAfter = thread.state.getLatestValue();
        expect(stateAfter.replies).not.to.equal(stateBefore.replies);

        thread.unregisterSubscriptions();
      });

      describe('Event: user.watching.stop', () => {
        it('ignores incoming event if the data do not match (channel or user.id)', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();

          client.dispatchEvent({
            type: 'user.watching.stop',
            channel: channelResponse,
            user: { id: 'bob' },
          });

          expect(thread.hasStaleState).to.be.false;

          client.dispatchEvent({
            type: 'user.watching.stop',
            channel: generateChannel().channel as ChannelResponse,
            user: { id: TEST_USER_ID },
          });

          expect(thread.hasStaleState).to.be.false;

          thread.unregisterSubscriptions();
        });

        it('marks own state as stale whenever current user stops watching associated channel', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();

          client.dispatchEvent({
            type: 'user.watching.stop',
            channel: channelResponse,
            user: { id: TEST_USER_ID },
          });

          expect(thread.hasStaleState).to.be.true;

          thread.unregisterSubscriptions();
        });
      });

      describe('Event: message.read', () => {
        it('does not update read state with events from other threads', () => {
          const thread = createTestThread({
            read: [
              {
                last_read: new Date().toISOString(),
                user: { id: 'bob' },
                unread_messages: 42,
              },
            ],
          });
          thread.registerSubscriptions();

          const stateBefore = thread.state.getLatestValue();
          expect(stateBefore.read['bob']?.unreadMessageCount).to.equal(42);

          client.dispatchEvent({
            type: 'message.read',
            user: { id: 'bob' },
            thread: generateThread(channelResponse, generateMsg()) as ThreadResponse,
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.read['bob']?.unreadMessageCount).to.equal(42);
        });

        it('correctly updates read information for user', () => {
          const lastReadAt = new Date();
          const thread = createTestThread({
            read: [
              {
                last_read: lastReadAt.toISOString(),
                last_read_message_id: '',
                unread_messages: 42,
                user: { id: 'bob' },
              },
            ],
          });
          thread.registerSubscriptions();

          const stateBefore = thread.state.getLatestValue();
          expect(stateBefore.read['bob']?.unreadMessageCount).to.equal(42);
          const createdAt = new Date();

          client.dispatchEvent({
            type: 'message.read',
            user: { id: 'bob' },
            thread: generateThread(channelResponse, generateMsg({ id: parentMessageResponse.id })) as ThreadResponse,
            created_at: createdAt.toISOString(),
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.read['bob']?.unreadMessageCount).to.equal(0);
          expect(stateAfter.read['bob']?.lastReadAt.toISOString()).to.equal(createdAt.toISOString());

          thread.unregisterSubscriptions();
        });
      });

      describe('Event: message.new', () => {
        it('ignores a reply if it does not belong to the associated thread', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();
          const stateBefore = thread.state.getLatestValue();

          client.dispatchEvent({
            type: 'message.new',
            message: generateMsg({ parent_id: uuidv4() }) as MessageResponse,
            user: { id: TEST_USER_ID },
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateBefore).to.equal(stateAfter);

          thread.unregisterSubscriptions();
        });

        it('prevents handling a reply if the state of the thread is stale', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();
          thread.state.partialNext({ isStateStale: true });
          const stateBefore = thread.state.getLatestValue();

          client.dispatchEvent({
            type: 'message.new',
            message: generateMsg({ parent_id: uuidv4() }) as MessageResponse,
            user: { id: TEST_USER_ID },
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateBefore).to.equal(stateAfter);

          thread.unregisterSubscriptions();
        });

        it('increments unread count if the reply does not belong to current user', () => {
          const thread = createTestThread({
            read: [
              {
                last_read: new Date().toISOString(),
                user: { id: TEST_USER_ID },
                unread_messages: 0,
              },
            ],
          });
          thread.registerSubscriptions();

          const newMessage = generateMsg({ parent_id: thread.id, user: { id: 'bob' } }) as MessageResponse;
          client.dispatchEvent({
            type: 'message.new',
            message: newMessage,
            user: { id: 'bob' },
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.replies).to.have.length(1);
          expect(stateAfter.replies.find((reply) => reply.id === newMessage.id)).not.to.be.undefined;
          expect(thread.ownUnreadCount).to.equal(1);

          thread.unregisterSubscriptions();
        });

        it('handles receiving a reply that was previously optimistically added', () => {
          const thread = createTestThread({
            latest_replies: [generateMsg() as MessageResponse],
            read: [
              {
                user: { id: TEST_USER_ID },
                last_read: new Date().toISOString(),
                unread_messages: 0,
              },
            ],
          });
          const message = generateMsg({
            parent_id: thread.id,
            user: { id: TEST_USER_ID },
          }) as MessageResponse;
          thread.upsertReplyLocally({ message });

          const stateBefore = thread.state.getLatestValue();
          expect(stateBefore.replies).to.have.length(2);
          expect(thread.ownUnreadCount).to.equal(0);

          client.dispatchEvent({
            type: 'message.new',
            message,
            user: { id: TEST_USER_ID },
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.replies).to.have.length(2);
          expect(thread.ownUnreadCount).to.equal(0);
        });
      });

      it('resets unread count when new message is by the current user', () => {
        const thread = createTestThread({
          read: [
            {
              last_read: new Date().toISOString(),
              user: { id: TEST_USER_ID },
              unread_messages: 42,
            },
          ],
        });
        thread.registerSubscriptions();

        expect(thread.ownUnreadCount).to.equal(42);

        client.dispatchEvent({
          type: 'message.new',
          message: generateMsg({
            parent_id: thread.id,
            user: { id: TEST_USER_ID },
          }) as MessageResponse,
          user: { id: TEST_USER_ID },
        });

        expect(thread.ownUnreadCount).to.equal(0);

        thread.unregisterSubscriptions();
      });

      it('does not increment unread count in an active thread', () => {
        const thread = createTestThread({
          read: [
            {
              last_read: new Date().toISOString(),
              user: { id: TEST_USER_ID },
              unread_messages: 0,
            },
          ],
        });
        thread.registerSubscriptions();
        thread.activate();

        client.dispatchEvent({
          type: 'message.new',
          message: generateMsg({
            parent_id: thread.id,
            user: { id: 'bob' },
          }) as MessageResponse,
          user: { id: 'bob' },
        });

        expect(thread.ownUnreadCount).to.equal(0);

        thread.unregisterSubscriptions();
      });

      describe('Event: message.deleted', () => {
        it('deletes reply if the message was hard-deleted', () => {
          const createdAt = new Date().getTime();
          // five messages "created" second apart
          const messages = Array.from(
            { length: 5 },
            (_, i) =>
              generateMsg({
                parent_id: parentMessageResponse.id,
                created_at: new Date(createdAt + 1000 * i).toISOString(),
              }) as MessageResponse,
          );
          const thread = createTestThread({ latest_replies: messages });
          thread.registerSubscriptions();

          const messageToDelete = messages[2];

          client.dispatchEvent({
            type: 'message.deleted',
            hard_delete: true,
            message: messageToDelete,
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.replies).to.have.lengthOf(4);
          expect(stateAfter.replies.find((reply) => reply.id === messageToDelete.id)).to.be.undefined;

          thread.unregisterSubscriptions();
        });
      });

      describe('Events: message.updated, reaction.new, reaction.deleted', () => {
        (['message.updated', 'reaction.new', 'reaction.deleted'] as const).forEach((eventType) => {
          it(`updates reply or parent message on "${eventType}"`, () => {
            const thread = createTestThread();
            const updateParentMessageOrReplyLocallySpy = sinon.spy(thread, 'updateParentMessageOrReplyLocally');
            thread.registerSubscriptions();

            client.dispatchEvent({
              type: eventType,
              message: generateMsg({ parent_id: thread.id }) as MessageResponse,
            });

            expect(updateParentMessageOrReplyLocallySpy.calledOnce).to.be.true;

            thread.unregisterSubscriptions();
          });
        });
      });
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

          expect(unreadThreadsCount).to.equal(unreadCount);
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

        it('adds parentMessageId to the unseenThreadIds array', () => {
          // artificial first page load
          threadManager.state.partialNext({ nextCursor: null });

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
          threadManager.state.partialNext({ nextCursor: null });

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

        it('adds parentMessageId to the existingReorderedThreadIds if such thread is already loaded within threads array', () => {
          // artificial first page load
          threadManager.state.partialNext({ threads: [thread] });

          expect(threadManager.state.getLatestValue().existingReorderedThreadIds).to.be.empty;
          expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;
          expect(threadManager.state.getLatestValue().active).to.be.false;

          client.dispatchEvent({
            received_at: new Date().toISOString(),
            type: 'notification.thread_message_new',
            message: generateMsg({ parent_id: thread.id }) as MessageResponse,
          });

          expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;
          expect(threadManager.state.getLatestValue().existingReorderedThreadIds).to.have.lengthOf(1);
          expect(threadManager.state.getLatestValue().existingReorderedThreadIds[0]).to.equal(thread.id);
        });

        it('skips parentMessageId addition to the existingReorderedThreadIds if the ThreadManager is inactive', () => {
          // artificial first page load
          threadManager.state.partialNext({ threads: [thread] });
          threadManager.activate();

          expect(threadManager.state.getLatestValue().existingReorderedThreadIds).to.be.empty;
          expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;
          expect(threadManager.state.getLatestValue().active).to.be.true;

          client.dispatchEvent({
            received_at: new Date().toISOString(),
            type: 'notification.thread_message_new',
            message: generateMsg({ parent_id: thread.id }) as MessageResponse,
          });

          expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;
          expect(threadManager.state.getLatestValue().existingReorderedThreadIds).to.be.empty;
        });
      });

      it('recovers from connection down', () => {
        threadManager.state.partialNext({ threads: [thread] });

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

        threadManager.state.partialNext({ threads: [thread] });

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

        threadManager.registerSubscriptions();
      });

      describe('ThreadManager.reload', () => {
        it('skips reload if both unseenThreadIds and existingReorderedThreadIds arrays are empty', async () => {
          const { unseenThreadIds, existingReorderedThreadIds } = threadManager.state.getLatestValue();

          expect(unseenThreadIds).to.be.empty;
          expect(existingReorderedThreadIds).to.be.empty;

          await threadManager.reload();

          expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;
          expect(threadManager.state.getLatestValue().existingReorderedThreadIds).to.be.empty;
          expect(stubbedQueryThreads.notCalled).to.be.true;
        });

        (['existingReorderedThreadIds', 'unseenThreadIds'] as const).forEach((bucketName) => {
          it(`doesn't skip reload if ${bucketName} is not empty`, async () => {
            threadManager.state.partialNext({ [bucketName]: ['t1'] });

            expect(threadManager.state.getLatestValue()[bucketName]).to.have.lengthOf(1);

            await threadManager.reload();

            expect(threadManager.state.getLatestValue()[bucketName]).to.be.empty;
            expect(stubbedQueryThreads.calledOnce).to.be.true;
          });
        });

        it('has been called with proper limits', async () => {
          threadManager.state.next((current) => ({
            ...current,
            threads: [thread],
            unseenThreadIds: ['t1'],
            existingReorderedThreadIds: ['t2'],
          }));

          await threadManager.reload();

          expect(stubbedQueryThreads.calledWithMatch({ limit: 2 })).to.be.true;
        });

        it('adds new thread if it does not exist within the threads array', async () => {
          threadManager.state.partialNext({ unseenThreadIds: ['t1'] });

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
          threadManager.state.partialNext({ threads: [thread], unseenThreadIds: ['t1'] });
          thread.state.partialNext({ isStateStale: true });

          const newThread = new Thread({
            client,
            threadData: generateThread(channelResponse, parentMessage, { thread_participants: [{ id: 'u1' }] }),
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
              threadData: generateThread(channelResponse, parentMessage, {
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

          threadManager.state.partialNext({ nextCursor: null });

          await threadManager.loadNextPage();

          expect(stubbedQueryThreads.called).to.be.false;
        });

        it('prevents loading next page if already loading', async () => {
          expect(threadManager.state.getLatestValue().loadingNextPage).is.false;

          threadManager.state.partialNext({ loadingNextPage: true });

          await threadManager.loadNextPage();

          expect(stubbedQueryThreads.called).to.be.false;
        });

        it('calls queryThreads with proper defaults', async () => {
          stubbedQueryThreads.resolves({
            threads: [],
            next: undefined,
          });

          await threadManager.loadNextPage();

          expect(
            stubbedQueryThreads.calledWithMatch({ limit: 25, participant_limit: 10, reply_limit: 10, watch: true }),
          ).to.be.true;
        });

        it('switches loading state properly', async () => {
          const spy = sinon.spy();

          threadManager.state.subscribeWithSelector((nextValue) => [nextValue.loadingNextPage], spy);
          spy.resetHistory();

          await threadManager.loadNextPage();

          expect(spy.callCount).to.equal(2);
          expect(spy.firstCall.calledWith([true])).to.be.true;
          expect(spy.lastCall.calledWith([false])).to.be.true;
        });

        it('sets proper nextCursor and threads', async () => {
          threadManager.state.partialNext({ threads: [thread] });

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

          threadManager.state.partialNext({ nextCursor: cursor1 });

          stubbedQueryThreads.resolves({
            threads: [],
            next: cursor2,
          });

          await threadManager.loadNextPage();

          const { nextCursor } = threadManager.state.getLatestValue();

          expect(stubbedQueryThreads.calledWithMatch({ next: cursor1 })).to.be.true;
          expect(nextCursor).to.equal(cursor2);
        });

        // FIXME: skipped as it's not needed until queryThreads supports reply sorting (asc/desc)
        it.skip('adjusts nextCursor & previousCusor properties of the queried threads according to query options', () => {
          const REPLY_COUNT = 3;

          const newThread = new Thread({
            client,
            threadData: generateThread(channelResponse, generateMsg(), {
              latest_replies: Array.from({ length: REPLY_COUNT }, () => generateMsg()),
              reply_count: REPLY_COUNT,
            }),
          });

          expect(newThread.state.getLatestValue().latestReplies).to.have.lengthOf(REPLY_COUNT);
          expect(newThread.state.getLatestValue().replyCount).to.equal(REPLY_COUNT);

          stubbedQueryThreads.resolves({
            threads: [newThread],
            next: undefined,
          });
        });
      });
    });
  });
});
