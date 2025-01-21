import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';

import { generateChannel } from './test-utils/generateChannel';
import { generateMsg } from './test-utils/generateMessage';
import { generateThreadResponse } from './test-utils/generateThreadResponse';
import { getClientWithUser } from './test-utils/getClient';

import sinon from 'sinon';
import {
  Channel,
  ChannelResponse,
  MessageResponse,
  StreamChat,
  Thread,
  ThreadManager,
  ThreadResponse,
  THREAD_MANAGER_INITIAL_STATE,
} from '../../src';
import { THREAD_RESPONSE_RESERVED_KEYS } from '../../src/thread';

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
      threadData: generateThreadResponse(
        { ...channelResponse, ...channelOverrides },
        { ...parentMessageResponse, ...parentMessageOverrides },
        overrides,
      ),
    });
  }

  beforeEach(() => {
    client = new StreamChat('apiKey');
    client._setUser({ id: TEST_USER_ID });
    channelResponse = generateChannel({
      channel: { id: uuidv4(), name: 'Test channel', members: [] },
    }).channel as ChannelResponse;
    channel = client.channel(channelResponse.type, channelResponse.id);
    parentMessageResponse = generateMsg() as MessageResponse;
    threadManager = new ThreadManager({ client });
  });

  describe('Thread', () => {
    it('initializes properly', () => {
      const threadResponse = generateThreadResponse(channelResponse, parentMessageResponse);
      // mimic pre-cached channel with existing members
      channel._hydrateMembers({ members: [{ user: { id: TEST_USER_ID } }] });
      const thread = new Thread({ client, threadData: threadResponse });
      const state = thread.state.getLatestValue();

      expect(threadResponse.channel.members).to.have.lengthOf(0);
      expect(threadResponse.read).to.have.lengthOf(0);
      expect(state.read).to.have.keys([TEST_USER_ID]);

      expect(thread.channel.state.members).to.have.keys([TEST_USER_ID]);
      expect(thread.id).to.equal(parentMessageResponse.id);
      expect(thread.channel.data?.name).to.equal(channelResponse.name);
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
            created_at: '2020-01-01T00:00:00Z',
          }) as MessageResponse;

          const message = generateMsg({
            parent_id: parentMessageResponse.id,
            text: 'bbb',
            created_at: '2020-01-01T00:00:10Z',
          }) as MessageResponse;

          const thread = createTestThread({ latest_replies: [optimisticMessage, message] });
          const updatedMessage: MessageResponse = {
            ...optimisticMessage,
            text: 'ccc',
            created_at: '2020-01-01T00:00:20Z',
          };

          const stateBefore = thread.state.getLatestValue();
          expect(stateBefore.replies).to.have.lengthOf(2);
          expect(stateBefore.replies[0].id).to.equal(optimisticMessage.id);
          expect(stateBefore.replies[0].text).to.equal('aaa');
          expect(stateBefore.replies[1].id).to.equal(message.id);

          thread.upsertReplyLocally({ message: updatedMessage, timestampChanged: true });

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
          expect(() => thread.updateParentMessageLocally({ message })).to.throw();
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

          thread.updateParentMessageLocally({ message: updatedMessage });

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
          expect(state.pagination.nextCursor).to.be.null;
        });

        it('updates pagination after loading next page (end reached)', async () => {
          const thread = createTestThread({
            latest_replies: [generateMsg(), generateMsg()] as MessageResponse[],
            reply_count: 3,
          });
          thread.state.next((current) => ({
            ...current,
            pagination: {
              ...current.pagination,
              nextCursor: 'cursor',
            },
          }));
          sinon.stub(thread, 'queryReplies').resolves({
            messages: [generateMsg()] as MessageResponse[],
            duration: '',
          });

          await thread.loadNextPage({ limit: 2 });

          const state = thread.state.getLatestValue();
          expect(state.pagination.nextCursor).to.be.null;
        });

        it('updates pagination after loading next page (end not reached)', async () => {
          const thread = createTestThread({
            latest_replies: [generateMsg(), generateMsg()] as MessageResponse[],
            reply_count: 4,
          });
          thread.state.next((current) => ({
            ...current,
            pagination: {
              ...current.pagination,
              nextCursor: 'cursor',
            },
          }));
          const lastMessage = generateMsg() as MessageResponse;
          sinon.stub(thread, 'queryReplies').resolves({
            messages: [generateMsg(), lastMessage] as MessageResponse[],
            duration: '',
          });

          await thread.loadNextPage({ limit: 2 });

          const state = thread.state.getLatestValue();
          expect(state.pagination.nextCursor).to.equal(lastMessage.id);
        });

        it('forms correct request when loading next page', async () => {
          const firstMessage = generateMsg() as MessageResponse;
          const lastMessage = generateMsg() as MessageResponse;
          const thread = createTestThread({ latest_replies: [firstMessage, lastMessage], reply_count: 3 });
          thread.state.next((current) => ({
            ...current,
            pagination: {
              ...current.pagination,
              nextCursor: lastMessage.id,
            },
          }));
          const queryRepliesStub = sinon.stub(thread, 'queryReplies').resolves({ messages: [], duration: '' });

          await thread.loadNextPage({ limit: 42 });

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

          await thread.loadPrevPage({ limit: 2 });

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

          await thread.loadPrevPage({ limit: 2 });

          const state = thread.state.getLatestValue();
          expect(state.pagination.prevCursor).to.equal(firstMessage.id);
        });

        it('forms correct request when loading previous page', async () => {
          const firstMessage = generateMsg() as MessageResponse;
          const lastMessage = generateMsg() as MessageResponse;
          const thread = createTestThread({ latest_replies: [firstMessage, lastMessage], reply_count: 3 });
          const queryRepliesStub = sinon.stub(thread, 'queryReplies').resolves({ messages: [], duration: '' });

          await thread.loadPrevPage({ limit: 42 });

          expect(
            queryRepliesStub.calledOnceWith({
              id_lt: firstMessage.id,
              limit: 42,
            }),
          ).to.be.true;
        });

        it('appends messages when loading next page', async () => {
          const initialMessages = [generateMsg(), generateMsg()] as MessageResponse[];
          const nextMessages = [generateMsg(), generateMsg()] as MessageResponse[];
          const thread = createTestThread({ latest_replies: initialMessages, reply_count: 4 });
          thread.state.next((current) => ({
            ...current,
            pagination: {
              ...current.pagination,
              nextCursor: initialMessages[1].id,
            },
          }));
          sinon.stub(thread, 'queryReplies').resolves({ messages: nextMessages, duration: '' });

          await thread.loadNextPage({ limit: 2 });

          const stateAfter = thread.state.getLatestValue();
          const expectedMessageOrder = [...initialMessages, ...nextMessages].map(({ id }) => id).join(', ');
          const actualMessageOrder = stateAfter.replies.map(({ id }) => id).join(', ');
          expect(actualMessageOrder).to.equal(expectedMessageOrder);
        });

        it('prepends messages when loading previous page', async () => {
          const initialMessages = [generateMsg(), generateMsg()] as MessageResponse[];
          const prevMessages = [generateMsg(), generateMsg()] as MessageResponse[];
          const thread = createTestThread({ latest_replies: initialMessages, reply_count: 4 });
          sinon.stub(thread, 'queryReplies').resolves({ messages: prevMessages, duration: '' });

          await thread.loadPrevPage({ limit: 2 });

          const stateAfter = thread.state.getLatestValue();
          const expectedMessageOrder = [...prevMessages, ...initialMessages].map(({ id }) => id).join(', ');
          const actualMessageOrder = stateAfter.replies.map(({ id }) => id).join(', ');
          expect(actualMessageOrder).to.equal(expectedMessageOrder);
        });
      });
    });

    describe('Subscription and Event Handlers', () => {
      it('marks active channel as read', () => {
        const clock = sinon.useFakeTimers();

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
        clock.runAll();

        const stateAfter = thread.state.getLatestValue();
        expect(stateAfter.active).to.be.true;
        expect(stubbedMarkAsRead.calledOnce).to.be.true;

        client.dispatchEvent({
          type: 'message.new',
          message: generateMsg({ parent_id: thread.id, user: { id: 'bob' } }) as MessageResponse,
          user: { id: 'bob' },
        });
        clock.runAll();

        expect(stubbedMarkAsRead.calledTwice).to.be.true;

        thread.unregisterSubscriptions();
        clock.restore();
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

      describe('Event: thread.updated', () => {
        it('ignores incoming event if the data do not match (parent_message_id)', () => {
          const thread = createTestThread({ title: 'A' });
          thread.registerSubscriptions();

          const stateBefore = thread.state.getLatestValue();
          expect(stateBefore.title).to.eq('A');

          client.dispatchEvent({
            type: 'thread.updated',
            thread: generateThreadResponse(channelResponse, generateMsg(), { title: 'B' }),
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.title).to.eq('A');
        });

        it('correctly updates thread-level properties', () => {
          const thread = createTestThread({ title: 'A' });
          thread.registerSubscriptions();

          const stateBefore = thread.state.getLatestValue();
          expect(stateBefore.title).to.eq('A');

          client.dispatchEvent({
            type: 'thread.updated',
            thread: generateThreadResponse(channelResponse, generateMsg({ id: parentMessageResponse.id }), {
              title: 'B',
            }),
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.title).to.eq('B');
        });

        it('properly handles custom data', () => {
          const customKey1 = uuidv4();
          const customKey2 = uuidv4();

          const thread = createTestThread({ [customKey1]: 1, [customKey2]: { key: 1 } });
          thread.registerSubscriptions();

          const stateBefore = thread.state.getLatestValue();

          expect(stateBefore.custom).to.not.have.keys(Object.keys(THREAD_RESPONSE_RESERVED_KEYS));
          expect(stateBefore.custom).to.have.keys([customKey1, customKey2]);
          expect(stateBefore.custom[customKey1]).to.equal(1);

          client.dispatchEvent({
            type: 'thread.updated',
            thread: generateThreadResponse(channelResponse, generateMsg({ id: parentMessageResponse.id }), {
              [customKey1]: 2,
            }),
          });

          const stateAfter = thread.state.getLatestValue();

          expect(stateAfter.custom).to.not.have.keys(Object.keys(THREAD_RESPONSE_RESERVED_KEYS));
          expect(stateAfter.custom).to.not.have.property(customKey2);
          expect(stateAfter.custom[customKey1]).to.equal(2);
        });
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
            thread: generateThreadResponse(channelResponse, generateMsg()) as ThreadResponse,
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
            thread: generateThreadResponse(
              channelResponse,
              generateMsg({ id: parentMessageResponse.id }),
            ) as ThreadResponse,
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
        it('deletes reply from local store if it was hard-deleted', () => {
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

        it('updates deleted_at property of the reply if it was soft deleted', () => {
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

          expect(messageToDelete.deleted_at).to.be.undefined;

          const deletedAt = new Date();
          client.dispatchEvent({
            type: 'message.deleted',
            message: { ...messageToDelete, type: 'deleted', deleted_at: deletedAt.toISOString() },
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.replies).to.have.lengthOf(5);
          expect(stateAfter.replies[2].id).to.equal(messageToDelete.id);
          expect(stateAfter.replies[2]).to.not.equal(messageToDelete);
          expect(stateAfter.replies[2].deleted_at).to.be.a('date');
          expect(stateAfter.replies[2].deleted_at!.toISOString()).to.equal(deletedAt.toISOString());
          expect(stateAfter.replies[2].type).to.equal('deleted');

          thread.unregisterSubscriptions();
        });

        it('handles deletion of the thread (updates deleted_at and parentMessage properties)', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();

          const stateBefore = thread.state.getLatestValue();

          const parentMessage = generateMsg({
            id: thread.id,
            deleted_at: new Date().toISOString(),
            type: 'deleted',
          }) as MessageResponse;

          expect(thread.id).to.equal(parentMessage.id);
          expect(stateBefore.deletedAt).to.be.null;

          client.dispatchEvent({ type: 'message.deleted', message: parentMessage });

          const stateAfter = thread.state.getLatestValue();

          expect(stateAfter.deletedAt).to.be.a('date');
          expect(stateAfter.deletedAt!.toISOString()).to.equal(parentMessage.deleted_at);
          expect(stateAfter.parentMessage.deleted_at).to.be.a('date');
          expect(stateAfter.parentMessage.deleted_at!.toISOString()).to.equal(parentMessage.deleted_at);
        });
      });

      describe('Events: message.updated, reaction.new, reaction.deleted', () => {
        (['message.updated', 'reaction.new', 'reaction.deleted', 'reaction.updated'] as const).forEach((eventType) => {
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
    it('initializes properly', () => {
      const state = threadManager.state.getLatestValue();
      expect(state.threads).to.be.empty;
      expect(state.unseenThreadIds).to.be.empty;
      expect(state.pagination.isLoading).to.be.false;
      expect(state.pagination.nextCursor).to.be.null;
    });

    describe('resetState', () => {
      it('resets the state properly', async () => {
        threadManager.state.partialNext({
          threads: [createTestThread(), createTestThread()],
          unseenThreadIds: ['1', '2'],
        });
        threadManager.registerSubscriptions();
        expect(threadManager.state.getLatestValue().threads).to.have.lengthOf(2);
        expect(threadManager.state.getLatestValue().unseenThreadIds).to.have.lengthOf(2);
        threadManager.resetState();
        expect(threadManager.state.getLatestValue()).to.be.deep.equal(THREAD_MANAGER_INITIAL_STATE);
      });
    });

    it('resets the thread state on disconnect', async () => {
      const clientWithUser = await getClientWithUser({ id: 'user1' });
      const thread = createTestThread();
      clientWithUser.threads.state.partialNext({ ready: true, threads: [thread] });
      clientWithUser.threads.registerSubscriptions();

      const { threads, unseenThreadIds } = clientWithUser.threads.state.getLatestValue();

      expect(threads).to.deep.equal([thread]);
      expect(unseenThreadIds.length).to.equal(0);

      await clientWithUser.disconnectUser();

      expect(clientWithUser.threads.state.getLatestValue().threads).to.have.lengthOf(0);
      expect(clientWithUser.threads.state.getLatestValue().unseenThreadIds).to.have.lengthOf(0);
    });

    describe('Subscription and Event Handlers', () => {
      beforeEach(() => {
        threadManager.registerSubscriptions();
      });

      afterEach(() => {
        threadManager.unregisterSubscriptions();
        sinon.restore();
      });

      ([
        ['health.check', 2],
        ['notification.mark_read', 1],
        ['notification.thread_message_new', 8],
        ['notification.channel_deleted', 11],
      ] as const).forEach(([eventType, expectedUnreadCount]) => {
        it(`updates unread thread count on "${eventType}"`, () => {
          client.dispatchEvent({
            type: eventType,
            unread_threads: expectedUnreadCount,
          });

          const { unreadThreadCount } = threadManager.state.getLatestValue();
          expect(unreadThreadCount).to.equal(expectedUnreadCount);
        });
      });

      it('removes threads from the state if their channel got deleted', () => {
        const thread = createTestThread();
        const toBeRemoved = [
          createTestThread({ channelOverrides: { id: 'channel1' } }),
          createTestThread({ channelOverrides: { id: 'channel1' } }),
          createTestThread({ channelOverrides: { id: 'channel2' } }),
        ];
        threadManager.state.partialNext({ threads: [thread, ...toBeRemoved] });

        expect(threadManager.state.getLatestValue().threads).to.have.lengthOf(4);

        client.dispatchEvent({
          type: 'notification.channel_deleted',
          cid: 'messaging:channel1',
        });

        client.dispatchEvent({
          type: 'notification.channel_deleted',
          cid: 'messaging:channel2',
        });

        expect(threadManager.state.getLatestValue().threads).to.deep.equal([thread]);
      });

      describe('Event: notification.thread_message_new', () => {
        it('ignores notification.thread_message_new before anything was loaded', () => {
          client.dispatchEvent({
            type: 'notification.thread_message_new',
            message: generateMsg({ parent_id: uuidv4() }) as MessageResponse,
          });

          expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;
        });

        it('tracks new unseen threads', () => {
          threadManager.state.partialNext({ ready: true });

          client.dispatchEvent({
            type: 'notification.thread_message_new',
            message: generateMsg({ parent_id: uuidv4() }) as MessageResponse,
          });

          expect(threadManager.state.getLatestValue().unseenThreadIds).to.have.lengthOf(1);
        });

        it('deduplicates unseen threads', () => {
          threadManager.state.partialNext({ ready: true });
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

        it('tracks thread order becoming stale', () => {
          const thread = createTestThread();
          threadManager.state.partialNext({
            threads: [thread],
            ready: true,
          });

          const stateBefore = threadManager.state.getLatestValue();
          expect(stateBefore.isThreadOrderStale).to.be.false;
          expect(stateBefore.unseenThreadIds).to.be.empty;

          client.dispatchEvent({
            received_at: new Date().toISOString(),
            type: 'notification.thread_message_new',
            message: generateMsg({ parent_id: thread.id }) as MessageResponse,
          });

          const stateAfter = threadManager.state.getLatestValue();
          expect(stateAfter.isThreadOrderStale).to.be.true;
          expect(stateAfter.unseenThreadIds).to.be.empty;
        });
      });

      it('reloads after connection drop', () => {
        const thread = createTestThread();
        threadManager.state.partialNext({ threads: [thread] });
        threadManager.registerSubscriptions();
        const stub = sinon.stub(client, 'queryThreads').resolves({
          threads: [],
          next: undefined,
        });
        const clock = sinon.useFakeTimers();

        client.dispatchEvent({
          type: 'connection.changed',
          online: false,
        });

        const { lastConnectionDropAt } = threadManager.state.getLatestValue();
        expect(lastConnectionDropAt).to.be.a('date');

        client.dispatchEvent({ type: 'connection.recovered' });
        clock.runAll();

        expect(stub.calledOnce).to.be.true;

        threadManager.unregisterSubscriptions();
        clock.restore();
      });

      it('reloads list on activation', () => {
        const stub = sinon.stub(threadManager, 'reload').resolves();
        threadManager.activate();
        expect(stub.called).to.be.true;
      });

      it('manages subscriptions when threads are added to and removed from the list', () => {
        const createTestThreadAndSpySubscriptions = () => {
          const thread = createTestThread({ parentMessageOverrides: { id: uuidv4() } });
          const registerSubscriptionsSpy = sinon.spy(thread, 'registerSubscriptions');
          const unregisterSubscriptionsSpy = sinon.spy(thread, 'unregisterSubscriptions');
          return [thread, registerSubscriptionsSpy, unregisterSubscriptionsSpy] as const;
        };
        const [thread1, registerThread1, unregisterThread1] = createTestThreadAndSpySubscriptions();
        const [thread2, registerThread2, unregisterThread2] = createTestThreadAndSpySubscriptions();
        const [thread3, registerThread3, unregisterThread3] = createTestThreadAndSpySubscriptions();

        threadManager.state.partialNext({
          threads: [thread1, thread2],
        });

        expect(registerThread1.calledOnce).to.be.true;
        expect(registerThread2.calledOnce).to.be.true;

        threadManager.state.partialNext({
          threads: [thread2, thread3],
        });

        expect(unregisterThread1.calledOnce).to.be.true;
        expect(registerThread3.calledOnce).to.be.true;

        threadManager.unregisterSubscriptions();

        expect(unregisterThread1.calledOnce).to.be.true;
        expect(unregisterThread2.calledOnce).to.be.true;
        expect(unregisterThread3.calledOnce).to.be.true;
      });
    });

    describe('Methods & Getters', () => {
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

      describe('threadsById', () => {
        it('lazily generates & re-generates a proper lookup table', () => {
          const thread1 = createTestThread({ parentMessageOverrides: { id: uuidv4() } });
          const thread2 = createTestThread({ parentMessageOverrides: { id: uuidv4() } });
          const thread3 = createTestThread({ parentMessageOverrides: { id: uuidv4() } });

          expect(threadManager.threadsById).to.be.empty;

          threadManager.state.partialNext({ threads: [thread1, thread2] });
          const state1 = threadManager.state.getLatestValue();

          expect(state1.threads).to.have.lengthOf(2);
          expect(Object.keys(threadManager.threadsById)).to.have.lengthOf(2);
          expect(threadManager.threadsById).to.have.keys(thread1.id, thread2.id);

          threadManager.state.partialNext({ threads: [thread3] });
          const state2 = threadManager.state.getLatestValue();

          expect(state2.threads).to.have.lengthOf(1);
          expect(Object.keys(threadManager.threadsById)).to.have.lengthOf(1);
          expect(threadManager.threadsById).to.have.keys(thread3.id);
          expect(threadManager.threadsById[thread3.id]).to.equal(thread3);
        });
      });

      describe('registerSubscriptions', () => {
        it('properly initiates unreadThreadCount on subscribeUnreadThreadsCountChange call', () => {
          client._setUser({ id: TEST_USER_ID, unread_threads: 4 });

          const stateBefore = threadManager.state.getLatestValue();
          expect(stateBefore.unreadThreadCount).to.equal(0);

          threadManager.registerSubscriptions();

          const stateAfter = threadManager.state.getLatestValue();
          expect(stateAfter.unreadThreadCount).to.equal(4);
        });
      });

      describe('reload', () => {
        it('reloads with a default limit if both threads and unseenThreadIds are empty', async () => {
          threadManager.state.partialNext({
            threads: [],
            unseenThreadIds: [],
          });
          await threadManager.reload();
          expect(stubbedQueryThreads.calledWithMatch({ limit: 25 })).to.be.true;
        });

        it('skips reload if there were no updates since the latest reload', async () => {
          threadManager.state.partialNext({ ready: true });
          await threadManager.reload();
          expect(stubbedQueryThreads.notCalled).to.be.true;
        });

        it('reloads if thread list order is stale', async () => {
          threadManager.state.partialNext({ isThreadOrderStale: true });

          await threadManager.reload();

          expect(threadManager.state.getLatestValue().isThreadOrderStale).to.be.false;
          expect(stubbedQueryThreads.calledOnce).to.be.true;
        });

        it('reloads if there are new unseen threads', async () => {
          threadManager.state.partialNext({ unseenThreadIds: [uuidv4()] });

          await threadManager.reload();

          expect(threadManager.state.getLatestValue().unseenThreadIds).to.be.empty;
          expect(stubbedQueryThreads.calledOnce).to.be.true;
        });

        it('picks correct limit when reloading', async () => {
          threadManager.state.partialNext({
            threads: [createTestThread()],
            unseenThreadIds: [uuidv4()],
          });

          await threadManager.reload();

          expect(stubbedQueryThreads.calledWithMatch({ limit: 2 })).to.be.true;
        });

        it('adds new thread instances to the list', async () => {
          const thread = createTestThread();
          threadManager.state.partialNext({ unseenThreadIds: [thread.id] });
          stubbedQueryThreads.resolves({
            threads: [thread],
            next: undefined,
          });

          await threadManager.reload();

          const { threads, unseenThreadIds } = threadManager.state.getLatestValue();

          expect(threads).to.contain(thread);
          expect(unseenThreadIds).to.be.empty;
        });

        it('reuses existing thread instances', async () => {
          const existingThread = createTestThread({ parentMessageOverrides: { id: uuidv4() } });
          const newThread = createTestThread({ parentMessageOverrides: { id: uuidv4() } });
          threadManager.state.partialNext({ threads: [existingThread], unseenThreadIds: [newThread.id] });
          stubbedQueryThreads.resolves({
            threads: [newThread, existingThread],
            next: undefined,
          });

          await threadManager.reload();

          const { threads } = threadManager.state.getLatestValue();

          expect(threads[0]).to.equal(newThread);
          expect(threads[1]).to.equal(existingThread);
        });

        it('hydrates existing stale threads when reloading', async () => {
          const existingThread = createTestThread();
          existingThread.state.partialNext({ isStateStale: true });
          const newThread = createTestThread({
            thread_participants: [{ user_id: 'u1' }] as ThreadResponse['thread_participants'],
          });
          threadManager.state.partialNext({
            threads: [existingThread],
            unseenThreadIds: [newThread.id],
          });
          stubbedQueryThreads.resolves({
            threads: [newThread],
            next: undefined,
          });

          await threadManager.reload();

          const { threads } = threadManager.state.getLatestValue();

          expect(threads).to.have.lengthOf(1);
          expect(threads).to.contain(existingThread);
          expect(existingThread.state.getLatestValue().participants).to.have.lengthOf(1);
        });

        it('reorders threads according to the response order', async () => {
          const existingThread = createTestThread({ parentMessageOverrides: { id: uuidv4() } });
          const newThread1 = createTestThread({ parentMessageOverrides: { id: uuidv4() } });
          const newThread2 = createTestThread({ parentMessageOverrides: { id: uuidv4() } });
          threadManager.state.partialNext({
            threads: [existingThread],
            unseenThreadIds: [newThread1.id, newThread2.id],
          });
          stubbedQueryThreads.resolves({
            threads: [newThread1, existingThread, newThread2],
            next: undefined,
          });

          await threadManager.reload();

          const { threads } = threadManager.state.getLatestValue();

          expect(threads[1]).to.equal(existingThread);
        });
      });

      describe('loadNextPage', () => {
        it('does nothing if there is no next page to load', async () => {
          threadManager.state.next((current) => ({
            ...current,
            pagination: {
              ...current.pagination,
              nextCursor: null,
            },
          }));

          await threadManager.loadNextPage();

          expect(stubbedQueryThreads.called).to.be.false;
        });

        it('prevents loading next page if already loading', async () => {
          threadManager.state.next((current) => ({
            ...current,
            pagination: {
              ...current.pagination,
              isLoadingNext: true,
              nextCursor: 'cursor',
            },
          }));

          await threadManager.loadNextPage();

          expect(stubbedQueryThreads.called).to.be.false;
        });

        it('forms correct request when loading next page', async () => {
          threadManager.state.next((current) => ({
            ...current,
            pagination: {
              ...current.pagination,
              nextCursor: 'cursor',
            },
          }));
          stubbedQueryThreads.resolves({
            threads: [],
            next: undefined,
          });

          await threadManager.loadNextPage();

          expect(
            stubbedQueryThreads.calledWithMatch({
              limit: 25,
              participant_limit: 10,
              reply_limit: 10,
              next: 'cursor',
              watch: true,
            }),
          ).to.be.true;
        });

        it('switches loading state properly', async () => {
          threadManager.state.next((current) => ({
            ...current,
            pagination: {
              ...current.pagination,
              nextCursor: 'cursor',
            },
          }));
          const spy = sinon.spy();
          threadManager.state.subscribeWithSelector(
            (nextValue) => ({ isLoadingNext: nextValue.pagination.isLoadingNext }),
            spy,
          );
          spy.resetHistory();

          await threadManager.loadNextPage();

          expect(spy.callCount).to.equal(2);
          expect(spy.firstCall.calledWith({ isLoadingNext: true })).to.be.true;
          expect(spy.lastCall.calledWith({ isLoadingNext: false })).to.be.true;
        });

        it('updates thread list and pagination', async () => {
          const existingThread = createTestThread({ parentMessageOverrides: { id: uuidv4() } });
          const newThread = createTestThread({ parentMessageOverrides: { id: uuidv4() } });
          threadManager.state.next((current) => ({
            ...current,
            threads: [existingThread],
            pagination: {
              ...current.pagination,
              nextCursor: 'cursor1',
            },
          }));
          stubbedQueryThreads.resolves({
            threads: [newThread],
            next: 'cursor2',
          });

          await threadManager.loadNextPage();

          const { threads, pagination } = threadManager.state.getLatestValue();

          expect(threads).to.have.lengthOf(2);
          expect(threads[1]).to.equal(newThread);
          expect(pagination.nextCursor).to.equal('cursor2');
        });
      });
    });
  });
});
