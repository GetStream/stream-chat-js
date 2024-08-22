import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';

import { generateChannel } from './test-utils/generateChannel';
import { generateMsg } from './test-utils/generateMessage';
import { generateThread } from './test-utils/generateThread';

import {
  Channel,
  ChannelResponse,
  DEFAULT_MARK_AS_READ_THROTTLE_DURATION,
  MessageResponse,
  StreamChat,
  Thread,
  ThreadManager,
  ThreadResponse,
  formatMessage,
} from '../../src';
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
    channelResponse = generateChannel({ channel: { id: uuidv4() } }).channel;
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
      describe('Thread.upsertReplyLocally', () => {
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

          thread.state.partialNext({ latestReplies: [newMessage] });

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

      describe('Thread.updateParentMessageLocally', () => {
        it('prevents updating a parent message if the ids do not match', () => {
          const newMessage = generateMsg();

          const fn = () => {
            thread.updateParentMessageLocally(newMessage as MessageResponse);
          };

          expect(fn).to.throw(Error);
        });

        it('updates parent message and related top-level properties (deletedAt & replyCount)', () => {
          const newMessage = generateMsg({
            id: parentMessageResponse.id,
            text: 'aaa',
            reply_count: 10,
            deleted_at: new Date().toISOString(),
          });

          const { deletedAt, replyCount, parentMessage } = thread.state.getLatestValue();

          // baseline
          expect(parentMessage!.id).to.equal(thread.id);
          expect(deletedAt).to.be.null;
          expect(replyCount).to.equal(0);
          expect(parentMessage!.text).to.equal(parentMessageResponse.text);

          thread.updateParentMessageLocally(newMessage as MessageResponse);

          expect(thread.state.getLatestValue().deletedAt).to.be.a('date');
          expect(thread.state.getLatestValue().deletedAt!.toISOString()).to.equal(
            (newMessage as MessageResponse).deleted_at,
          );
          expect(thread.state.getLatestValue().replyCount).to.equal(newMessage.reply_count);
          expect(thread.state.getLatestValue().parentMessage!.text).to.equal(newMessage.text);
        });
      });

      describe('Thread.updateParentMessageOrReplyLocally', () => {
        it('calls upsertReplyLocally if the message has parent_id and it equals to the thread.id', () => {
          const upsertReplyLocallyStub = sinon.stub(thread, 'upsertReplyLocally').returns();
          const updateParentMessageLocallyStub = sinon.stub(thread, 'updateParentMessageLocally').returns();

          thread.updateParentMessageOrReplyLocally(generateMsg({ parent_id: thread.id }) as MessageResponse);

          expect(upsertReplyLocallyStub.called).to.be.true;
          expect(updateParentMessageLocallyStub.called).to.be.false;
        });

        it('calls updateParentMessageLocally if message does not have parent_id and its id equals to the id of the thread', () => {
          const upsertReplyLocallyStub = sinon.stub(thread, 'upsertReplyLocally').returns();
          const updateParentMessageLocallyStub = sinon.stub(thread, 'updateParentMessageLocally').returns();

          thread.updateParentMessageOrReplyLocally(generateMsg({ id: thread.id }) as MessageResponse);

          expect(upsertReplyLocallyStub.called).to.be.false;
          expect(updateParentMessageLocallyStub.called).to.be.true;
        });

        it('does not call either updateParentMessageLocally or upsertReplyLocally', () => {
          const upsertReplyLocallyStub = sinon.stub(thread, 'upsertReplyLocally').returns();
          const updateParentMessageLocallyStub = sinon.stub(thread, 'updateParentMessageLocally').returns();

          thread.updateParentMessageOrReplyLocally(generateMsg() as MessageResponse);

          expect(upsertReplyLocallyStub.called).to.be.false;
          expect(updateParentMessageLocallyStub.called).to.be.false;
        });
      });

      describe('Thread.partiallyReplaceState', () => {
        it('prevents copying state of the instance with different id', () => {
          const newThread = new Thread({
            client,
            threadData: generateThread(generateChannel({ channel: { id: channelResponse.id } }).channel, generateMsg()),
          });

          expect(thread.id).to.not.equal(newThread.id);

          thread.partiallyReplaceState({ thread: newThread });

          const { read, latestReplies, parentMessage, participants } = thread.state.getLatestValue();

          // compare non-primitive values only
          expect(read).to.not.equal(newThread.state.getLatestValue().read);
          expect(latestReplies).to.not.equal(newThread.state.getLatestValue().latestReplies);
          expect(parentMessage).to.not.equal(newThread.state.getLatestValue().parentMessage);
          expect(participants).to.not.equal(newThread.state.getLatestValue().participants);
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

          const { read, latestReplies, parentMessage, participants } = thread.state.getLatestValue();

          // compare non-primitive values only
          expect(read).to.equal(newThread.state.getLatestValue().read);
          expect(latestReplies).to.equal(newThread.state.getLatestValue().latestReplies);
          expect(parentMessage).to.equal(newThread.state.getLatestValue().parentMessage);
          expect(participants).to.equal(newThread.state.getLatestValue().participants);
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
          thread.state.partialNext({
            read: {
              [TEST_USER_ID]: {
                lastReadAt: new Date(),
                last_read: '',
                last_read_message_id: '',
                unread_messages: 2,
                user: { id: TEST_USER_ID },
              },
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
        it('deletes appropriate message from the latestReplies array', () => {
          const TARGET_MESSAGE_INDEX = 2;

          const createdAt = new Date().getTime();
          // five messages "created" second apart
          thread.state.partialNext({
            latestReplies: Array.from({ length: 5 }, (_, i) =>
              formatMessage(
                generateMsg({ created_at: new Date(createdAt + 1000 * i).toISOString() }) as MessageResponse,
              ),
            ),
          });

          const { latestReplies } = thread.state.getLatestValue();

          expect(latestReplies).to.have.lengthOf(5);

          const messageToDelete = generateMsg({
            created_at: latestReplies[TARGET_MESSAGE_INDEX].created_at.toISOString(),
            id: latestReplies[TARGET_MESSAGE_INDEX].id,
          });

          expect(latestReplies[TARGET_MESSAGE_INDEX].id).to.equal(messageToDelete.id);
          expect(latestReplies[TARGET_MESSAGE_INDEX].created_at.toISOString()).to.equal(messageToDelete.created_at);

          thread.deleteReplyLocally({ message: messageToDelete as MessageResponse });

          // check whether array signatures changed
          expect(thread.state.getLatestValue().latestReplies).to.not.equal(latestReplies);
          expect(thread.state.getLatestValue().latestReplies).to.have.lengthOf(4);
          expect(thread.state.getLatestValue().latestReplies[TARGET_MESSAGE_INDEX].id).to.not.equal(messageToDelete.id);
        });
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

      describe('Thread.loadNextPage', () => {});

      describe('Thread.loadPreviousPage', () => {});
    });

    describe('Subscription Handlers', () => {
      // let timers: sinon.SinonFakeTimers;

      beforeEach(() => {
        thread.registerSubscriptions();
      });

      it('calls markAsRead whenever thread becomes active or own reply count increases', () => {
        const timers = sinon.useFakeTimers({ toFake: ['setTimeout'] });

        const stubbedMarkAsRead = sinon.stub(thread, 'markAsRead').resolves();

        thread.incrementOwnUnreadCount();

        expect(thread.state.getLatestValue().active).to.be.false;
        expect(thread.state.getLatestValue().read[TEST_USER_ID].unread_messages).to.equal(1);
        expect(stubbedMarkAsRead.called).to.be.false;

        thread.activate();

        expect(thread.state.getLatestValue().active).to.be.true;
        expect(stubbedMarkAsRead.calledOnce, 'Called once').to.be.true;

        thread.incrementOwnUnreadCount();

        timers.tick(DEFAULT_MARK_AS_READ_THROTTLE_DURATION + 1);

        expect(stubbedMarkAsRead.calledTwice, 'Called twice').to.be.true;

        timers.restore();
      });

      it('recovers from stale state whenever the thread becomes active (or is active and its state becomes stale)', async () => {
        // prepare
        const newThread = new Thread({
          client,
          threadData: generateThread(channelResponse, generateMsg({ id: parentMessageResponse.id })),
        });
        const stubbedGetThread = sinon.stub(client, 'getThread').resolves(newThread);
        const partiallyReplaceStateSpy = sinon.spy(thread, 'partiallyReplaceState');

        thread.state.partialNext({ isStateStale: true });

        expect(thread.state.getLatestValue().isStateStale).to.be.true;
        expect(stubbedGetThread.called).to.be.false;
        expect(partiallyReplaceStateSpy.called).to.be.false;

        thread.activate();

        expect(stubbedGetThread.calledOnce).to.be.true;

        await stubbedGetThread.firstCall.returnValue;

        expect(partiallyReplaceStateSpy.calledWith({ thread: newThread })).to.be.true;
      });

      describe('Event user.watching.stop', () => {
        it('ignores incoming event if the data do not match (channel or user.id)', () => {
          client.dispatchEvent({
            type: 'user.watching.stop',
            channel: channelResponse as ChannelResponse,
            user: { id: 'bob' },
          });

          expect(thread.state.getLatestValue().isStateStale).to.be.false;

          client.dispatchEvent({
            type: 'user.watching.stop',
            channel: generateChannel().channel as ChannelResponse,
            user: { id: TEST_USER_ID },
          });

          expect(thread.state.getLatestValue().isStateStale).to.be.false;
        });

        it('marks own state as stale whenever current user stops watching associated channel', () => {
          client.dispatchEvent({
            type: 'user.watching.stop',
            channel: channelResponse as ChannelResponse,
            user: { id: TEST_USER_ID },
          });

          expect(thread.state.getLatestValue().isStateStale).to.be.true;
        });
      });

      describe('Event message.read', () => {
        it('prevents adjusting unread_messages & last_read if thread.id does not match', () => {
          // prepare
          thread.incrementOwnUnreadCount();
          expect(thread.state.getLatestValue().read[TEST_USER_ID].unread_messages).to.equal(1);

          client.dispatchEvent({
            type: 'message.read',
            user: { id: TEST_USER_ID },
            thread: (generateThread(channelResponse, generateMsg()) as unknown) as ThreadResponse,
          });

          expect(thread.state.getLatestValue().read[TEST_USER_ID].unread_messages).to.equal(1);
        });

        [TEST_USER_ID, 'bob'].forEach((userId) => {
          it(`correctly sets read information for user with id: ${userId}`, () => {
            // prepare
            const lastReadAt = new Date();
            thread.state.partialNext({
              read: {
                [userId]: {
                  lastReadAt: lastReadAt,
                  last_read: lastReadAt.toISOString(),
                  last_read_message_id: '',
                  unread_messages: 1,
                  user: { id: userId },
                },
              },
            });

            expect(thread.state.getLatestValue().read[userId].unread_messages).to.equal(1);

            const createdAt = new Date().toISOString();

            client.dispatchEvent({
              type: 'message.read',
              user: { id: userId },
              thread: (generateThread(
                channelResponse,
                generateMsg({ id: parentMessageResponse.id }),
              ) as unknown) as ThreadResponse,
              created_at: createdAt,
            });

            expect(thread.state.getLatestValue().read[userId].unread_messages).to.equal(0);
            expect(thread.state.getLatestValue().read[userId].last_read).to.equal(createdAt);
          });
        });
      });

      describe('Event message.new', () => {
        it('prevents handling a reply if it does not belong to the associated thread', () => {
          // prepare
          const upsertReplyLocallySpy = sinon.spy(thread, 'upsertReplyLocally');

          client.dispatchEvent({
            type: 'message.new',
            message: generateMsg({ parent_id: uuidv4() }) as MessageResponse,
          });

          expect(upsertReplyLocallySpy.called).to.be.false;
        });

        it('prevents handling a reply if the state of the thread is stale', () => {
          // prepare
          const upsertReplyLocallySpy = sinon.spy(thread, 'upsertReplyLocally');

          thread.state.partialNext({ isStateStale: true });

          client.dispatchEvent({ type: 'message.new', message: generateMsg({ id: thread.id }) as MessageResponse });

          expect(upsertReplyLocallySpy.called).to.be.false;
        });

        it('calls upsertLocalReply with proper values and calls incrementOwnUnreadCount if the reply does not belong to current user', () => {
          // prepare
          const upsertReplyLocallySpy = sinon.spy(thread, 'upsertReplyLocally');
          const incrementOwnUnreadCountSpy = sinon.spy(thread, 'incrementOwnUnreadCount');

          const newMessage = generateMsg({ parent_id: thread.id, user: { id: 'bob' } }) as MessageResponse;

          client.dispatchEvent({
            type: 'message.new',
            message: newMessage,
          });

          expect(upsertReplyLocallySpy.calledWith({ message: newMessage, timestampChanged: false })).to.be.true;
          expect(incrementOwnUnreadCountSpy.called).to.be.true;
        });

        it('calls upsertLocalReply with timestampChanged true if the reply belongs to the current user', () => {
          // prepare
          const upsertReplyLocallySpy = sinon.spy(thread, 'upsertReplyLocally');
          const incrementOwnUnreadCountSpy = sinon.spy(thread, 'incrementOwnUnreadCount');

          const newMessage = generateMsg({ parent_id: thread.id, user: { id: TEST_USER_ID } }) as MessageResponse;

          client.dispatchEvent({
            type: 'message.new',
            message: newMessage,
          });

          expect(upsertReplyLocallySpy.calledWith({ message: newMessage, timestampChanged: true })).to.be.true;
          expect(incrementOwnUnreadCountSpy.called).to.be.false;
        });

        // TODO: cover failed replies at some point
      });

      describe('Events message.updated, message.deleted, reaction.new, reaction.deleted', () => {
        it('calls deleteReplyLocally if the reply has been hard-deleted', () => {
          const deleteReplyLocallySpy = sinon.spy(thread, 'deleteReplyLocally');
          const updateParentMessageOrReplyLocallySpy = sinon.spy(thread, 'updateParentMessageOrReplyLocally');

          client.dispatchEvent({
            type: 'message.deleted',
            hard_delete: true,
            message: generateMsg({ parent_id: thread.id }) as MessageResponse,
          });

          expect(deleteReplyLocallySpy.calledOnce).to.be.true;
          expect(updateParentMessageOrReplyLocallySpy.called).to.be.false;
        });

        (['message.updated', 'message.deleted', 'reaction.new', 'reaction.deleted'] as const).forEach((eventType) => {
          it(`calls updateParentMessageOrReplyLocally on ${eventType}`, () => {
            const updateParentMessageOrReplyLocallySpy = sinon.spy(thread, 'updateParentMessageOrReplyLocally');

            client.dispatchEvent({
              type: eventType,
              message: generateMsg({ parent_id: thread.id }) as MessageResponse,
            });

            expect(updateParentMessageOrReplyLocallySpy.calledOnce).to.be.true;
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
