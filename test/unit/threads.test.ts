import { generateChannel } from './test-utils/generateChannel';
import { generateMsg } from './test-utils/generateMessage';
import { generateThreadResponse } from './test-utils/generateThreadResponse';
import { getClientWithUser } from './test-utils/getClient';
import { formatMessage, generateUUIDv4 as uuidv4 } from '../../src/utils';

import sinon from 'sinon';
import {
  Channel,
  ChannelResponse,
  MessageResponse,
  StreamChat,
  Thread,
  ThreadManager,
  ThreadStateResponse,
  THREAD_MANAGER_INITIAL_STATE,
  ThreadFilters,
  SortParamRequest,
} from '../../src';

import { describe, it, beforeEach, expect, afterEach } from 'vitest';

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
  }: Partial<ThreadStateResponse> & {
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

  function createMinimalThread({
    parentMessageOverrides = {},
    draft,
  }: {
    parentMessageOverrides?: Partial<MessageResponse>;
    draft?: {
      channel_cid: string;
      created_at: string;
      message: { id: string; text: string; parent_id?: string };
      parent_id?: string;
    };
  } = {}) {
    return new Thread({
      client,
      channel,
      parentMessage: { ...parentMessageResponse, ...parentMessageOverrides },
      draft,
    });
  }

  // The messagePaginator is the sole reply source (Thread.state.replies was removed).
  const repliesOf = (thread: Thread) =>
    thread.messagePaginator.state.getLatestValue().items ?? [];

  // A realistic reply carries a cid + parent_id so it passes the reply paginator's client-side
  // filter ({ cid, parent_id }) and shows up in messagePaginator.state.items (the rendered list).
  // Without cid, ingestItem indexes the message but the filter excludes it from state.items.
  const makeReply = (overrides: Partial<MessageResponse> = {}) =>
    generateMsg({
      cid: channel.cid,
      parent_id: parentMessageResponse.id,
      ...overrides,
    }) as MessageResponse;

  beforeEach(() => {
    client = new StreamChat('apiKey');
    client._setUser({ id: TEST_USER_ID });
    channelResponse = generateChannel({
      channel: { id: uuidv4(), members: [], custom: { name: 'Test channel' } },
    }).channel as ChannelResponse;
    channel = client.channel(channelResponse.type, channelResponse.id);
    channel.initialized = true;
    parentMessageResponse = generateMsg() as MessageResponse;
    threadManager = new ThreadManager({ client });
  });

  describe('Thread', () => {
    it('initializes properly', () => {
      const threadResponse = generateThreadResponse(
        channelResponse,
        parentMessageResponse,
      );
      // mimic pre-cached channel with existing members
      channel._hydrateMembers({ members: [{ user: { id: TEST_USER_ID } }] });
      const thread = new Thread({ client, threadData: threadResponse });
      const state = thread.state.getLatestValue();

      expect(threadResponse.channel.members).to.have.lengthOf(0);
      expect(threadResponse.read).to.have.lengthOf(0);
      expect(state.read).to.have.keys([TEST_USER_ID]);

      expect(thread.channel.state.members).to.have.keys([TEST_USER_ID]);
      expect(thread.id).to.equal(parentMessageResponse.id);
      // @ts-expect-error `name` is a custom property
      expect(thread.channel.data?.name).to.equal(channelResponse.name);
      expect(thread.messagePaginator.sort).to.deep.equal([
        { field: 'created_at', direction: -1 },
      ]);
      expect(thread.messagePaginator.requestSort).to.deep.equal([
        { field: 'created_at', direction: -1 },
      ]);
      expect(thread.messagePaginator.itemOrder).to.deep.equal([
        { field: 'created_at', direction: 1 },
      ]);
      expect(thread.messagePaginator.pageSize).to.equal(50);
    });

    it('seeds the reply paginator from latest_replies (complete window -> no older to load)', () => {
      const reply1 = generateMsg({
        parent_id: parentMessageResponse.id,
      }) as MessageResponse;
      const reply2 = generateMsg({
        parent_id: parentMessageResponse.id,
      }) as MessageResponse;
      const thread = createTestThread({
        latest_replies: [reply1, reply2],
        reply_count: 2,
      });

      const paginatorState = thread.messagePaginator.state.getLatestValue();
      expect(paginatorState.items).to.have.lengthOf(2);
      expect(paginatorState.items?.map((reply) => reply.id)).to.have.members([
        reply1.id,
        reply2.id,
      ]);
      // latest_replies already held every reply, so there is nothing older to fetch
      expect(paginatorState.hasMoreTail).to.be.false;
    });

    it('seeds the reply paginator and keeps hasMoreTail for a partial latest_replies window', () => {
      const reply1 = generateMsg({
        parent_id: parentMessageResponse.id,
      }) as MessageResponse;
      const reply2 = generateMsg({
        parent_id: parentMessageResponse.id,
      }) as MessageResponse;
      const thread = createTestThread({
        latest_replies: [reply1, reply2],
        reply_count: 10,
      });

      const paginatorState = thread.messagePaginator.state.getLatestValue();
      expect(paginatorState.items).to.have.lengthOf(2);
      // older replies exist beyond the most-recent window -> still paginable
      expect(paginatorState.hasMoreTail).to.be.true;
      // seeding records a query shape (isInitialized) so the first paginate continues from this
      // page instead of first-page-resetting (wiping items + re-fetching page 1).
      expect(thread.messagePaginator.isInitialized).to.be.true;
    });

    it('leaves the reply paginator unseeded (items undefined, not initialized) with no latest_replies', () => {
      const thread = createTestThread({ latest_replies: [], reply_count: 0 });
      expect(thread.messagePaginator.state.getLatestValue().items).to.be.undefined;
      expect(thread.messagePaginator.isInitialized).to.be.false;
    });

    it('seeds the reply paginator lastMessageAt from the thread last_message_at', () => {
      const thread = createTestThread({
        latest_replies: [],
        reply_count: 0,
        last_message_at: '2030-01-01T00:00:00.000Z',
      });
      // The server floor seeds the sort key even with no replies loaded to display.
      expect(thread.messagePaginator.lastMessageAt?.getTime()).to.equal(
        new Date('2030-01-01T00:00:00.000Z').getTime(),
      );
      expect(thread.messagePaginator.lastMessage).to.be.null;
    });

    it('initializes properly without threadData', () => {
      const thread = createMinimalThread();
      const state = thread.state.getLatestValue();

      expect(thread.id).to.equal(parentMessageResponse.id);
      expect(thread.channel.cid).to.equal(channel.cid);
      expect(state.parentMessage.id).to.equal(parentMessageResponse.id);
      expect(repliesOf(thread)).to.deep.equal([]);
      expect(state.participants).to.deep.equal([]);
      expect(state.custom).to.deep.equal({});
      expect(state.read).to.have.keys([TEST_USER_ID]);
      expect(thread.messagePaginator.sort).to.deep.equal([
        { field: 'created_at', direction: -1 },
      ]);
      expect(thread.messagePaginator.requestSort).to.deep.equal([
        { field: 'created_at', direction: -1 },
      ]);
      expect(thread.messagePaginator.itemOrder).to.deep.equal([
        { field: 'created_at', direction: 1 },
      ]);
      expect(thread.messagePaginator.pageSize).to.equal(50);
    });

    it('throws if minimal init parent message id is missing', () => {
      expect(() =>
        createMinimalThread({
          parentMessageOverrides: { id: '' },
        }),
      ).to.throw();
    });

    it('accepts draft in minimal init path', () => {
      const draftId = uuidv4();
      const thread = createMinimalThread({
        draft: {
          channel_cid: channel.cid,
          created_at: new Date().toISOString(),
          message: {
            id: draftId,
            text: 'draft text',
            parent_id: parentMessageResponse.id,
          },
          parent_id: parentMessageResponse.id,
        },
      });

      expect(thread.messageComposer.draftId).to.equal(draftId);
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
          const message = makeReply({ parent_id: thread.id });
          expect(repliesOf(thread)).to.have.lengthOf(0);

          thread.upsertReplyLocally({ message });

          const replies = repliesOf(thread);
          expect(replies).to.have.lengthOf(1);
          expect(replies[0].id).to.equal(message.id);
        });

        it('updates existing message', () => {
          const message = makeReply({ text: 'aaa' });
          const thread = createTestThread({ latest_replies: [message], reply_count: 1 });
          const udpatedMessage = { ...message, text: 'bbb' };

          const repliesBefore = repliesOf(thread);
          expect(repliesBefore).to.have.lengthOf(1);
          expect(repliesBefore[0].id).to.equal(message.id);
          expect(repliesBefore[0].text).to.not.equal(udpatedMessage.text);

          thread.upsertReplyLocally({ message: udpatedMessage });

          const repliesAfter = repliesOf(thread);
          expect(repliesAfter).to.have.lengthOf(1);
          expect(repliesAfter[0].text).to.equal(udpatedMessage.text);
        });

        it('updates optimistically added message', () => {
          const optimisticMessage = makeReply({
            text: 'aaa',
            created_at: new Date('2020-01-01T00:00:00Z'),
          }) as MessageResponse;

          const message = makeReply({
            text: 'bbb',
            created_at: new Date('2020-01-01T00:00:10Z'),
          }) as MessageResponse;

          const thread = createTestThread({
            latest_replies: [optimisticMessage, message],
            reply_count: 2,
          });
          const updatedMessage: MessageResponse = {
            ...optimisticMessage,
            text: 'ccc',
            created_at: new Date('2020-01-01T00:00:20Z'),
          };

          const repliesBefore = repliesOf(thread);
          expect(repliesBefore).to.have.lengthOf(2);
          expect(repliesBefore[0].id).to.equal(optimisticMessage.id);
          expect(repliesBefore[0].text).to.equal('aaa');
          expect(repliesBefore[1].id).to.equal(message.id);

          thread.upsertReplyLocally({ message: updatedMessage, timestampChanged: true });

          // Updating the optimistic reply with a newer created_at repositions it after `message`.
          const repliesAfter = repliesOf(thread);
          expect(repliesAfter).to.have.lengthOf(2);
          expect(repliesAfter[0].id).to.equal(message.id);
          expect(repliesAfter[1].id).to.equal(optimisticMessage.id);
          expect(repliesAfter[1].text).to.equal('ccc');
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
          // `state.parentMessage` is a projection of the client-global message store; the update
          // reflects through the store subscription registered here.
          thread.registerSubscriptions();

          const stateBefore = thread.state.getLatestValue();
          expect(stateBefore.deletedAt).to.be.null;
          expect(stateBefore.replyCount).to.equal(0);
          expect(stateBefore.parentMessage.text).to.equal(parentMessageResponse.text);

          const nextParticipants = [
            { id: 'participant-1' },
          ] as unknown as ThreadResponse['thread_participants'];
          const updatedMessage = generateMsg({
            deleted_at: new Date(),
            id: parentMessageResponse.id,
            reply_count: 10,
            text: 'aaa',
            thread_participants: nextParticipants,
          }) as MessageResponse;

          thread.updateParentMessageLocally({ message: updatedMessage });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.deletedAt).to.be.not.null;
          expect(stateAfter.deletedAt!.toISOString()).to.equal(
            updatedMessage.deleted_at!.toISOString(),
          );
          expect(stateAfter.replyCount).to.equal(updatedMessage.reply_count);
          expect(stateAfter.participants).to.have.lengthOf(1);
          expect(stateAfter.participants?.[0].user_id).to.equal('participant-1');
          expect(stateAfter.parentMessage.text).to.equal(updatedMessage.text);
        });
      });

      describe('updateParentMessageOrReplyLocally', () => {
        it('updates reply if the message has a matching parent id', () => {
          const thread = createTestThread();
          const message = generateMsg({ parent_id: thread.id }) as MessageResponse;
          const upsertReplyLocallyStub = sinon.stub(thread, 'upsertReplyLocally');
          const updateParentMessageLocallyStub = sinon.stub(
            thread,
            'updateParentMessageLocally',
          );

          thread.updateParentMessageOrReplyLocally(message);

          expect(upsertReplyLocallyStub.called).to.be.true;
          expect(updateParentMessageLocallyStub.called).to.be.false;
        });

        it('updates parent message if the message has a matching id and is not a reply', () => {
          const thread = createTestThread();
          const message = generateMsg({ id: thread.id }) as MessageResponse;
          const upsertReplyLocallyStub = sinon.stub(thread, 'upsertReplyLocally');
          const updateParentMessageLocallyStub = sinon.stub(
            thread,
            'updateParentMessageLocally',
          );

          thread.updateParentMessageOrReplyLocally(message);

          expect(upsertReplyLocallyStub.called).to.be.false;
          expect(updateParentMessageLocallyStub.called).to.be.true;
        });

        it('does nothing if the message is unrelated to the thread', () => {
          const thread = createTestThread();
          const message = generateMsg() as MessageResponse;
          const upsertReplyLocallyStub = sinon.stub(thread, 'upsertReplyLocally');
          const updateParentMessageLocallyStub = sinon.stub(
            thread,
            'updateParentMessageLocally',
          );

          thread.updateParentMessageOrReplyLocally(message);

          expect(upsertReplyLocallyStub.called).to.be.false;
          expect(updateParentMessageLocallyStub.called).to.be.false;
        });
      });

      describe('hydrateState', () => {
        it('prevents hydrating state from the instance with a different id', () => {
          const thread = createTestThread();
          const otherThread = createTestThread({
            parentMessageOverrides: { id: uuidv4() },
          });

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
          expect(stateAfter.parentMessage).to.equal(hydrationState.parentMessage);
          expect(stateAfter.participants).to.equal(hydrationState.participants);
        });

        it('retains failed replies after hydration', () => {
          const thread = createTestThread();
          const hydrationThread = createTestThread({
            latest_replies: [makeReply({ created_at: '2020-01-01T00:00:01.000Z' })],
            reply_count: 1,
          });

          // Pinned, failed reply NEWEST: `makeReply()` reads `created_at` from the clock, so implicit
          // timestamps landed in random order and an older-than-window reply sits below it, not in
          // view — ~50% flaky. A just-attempted send is the newest thing anyway.
          const failedMessage = makeReply({
            created_at: '2020-01-01T00:00:09.000Z',
            status: 'failed',
          });
          thread.upsertReplyLocally({ message: failedMessage });

          thread.hydrateState(hydrationThread);

          // The failed reply survives the hydrate (it is re-ingested into the paginator).
          expect(repliesOf(thread).map((reply) => reply.id)).to.include(failedMessage.id);
        });

        it('re-derives a paginatable reply cursor over a stale window (Thread.reload stays paginatable offline)', () => {
          const existingReply = generateMsg({
            parent_id: parentMessageResponse.id,
            created_at: '2020-01-01T00:00:00.000Z',
          }) as MessageResponse;
          // Head-anchored, older replies still to load (reply_count > loaded).
          const thread = createTestThread({
            latest_replies: [existingReply],
            reply_count: 10,
          });
          // Simulate a reply window preloaded with a stale/"complete" cursor (offline DB): "load older
          // replies" is dead if the reconnect hydrate PRESERVES it instead of re-deriving.
          thread.messagePaginator.state.partialNext({
            hasMoreTail: false,
            cursor: { tailward: null, headward: null },
          });
          expect(thread.messagePaginator.state.getLatestValue().hasMoreTail).to.be.false;

          // Reconnect hydrate (Thread.reload → hydrateState → mergeNewestPage) must RE-DERIVE the cursor
          // from the merged reply window so pagination works again.
          const hydrationThread = createTestThread({
            latest_replies: [existingReply],
            reply_count: 10,
          });
          thread.hydrateState(hydrationThread);

          expect(thread.messagePaginator.state.getLatestValue().hasMoreTail).to.be.true;
        });

        it('merges the incoming newest reply window into the reply paginator', () => {
          const existingReply = generateMsg({
            parent_id: parentMessageResponse.id,
            created_at: '2020-01-01T00:00:00.000Z',
            text: 'original',
          }) as MessageResponse;
          // Head-anchored, with older replies still to load (reply_count > loaded).
          const thread = createTestThread({
            latest_replies: [existingReply],
            reply_count: 10,
          });
          expect(thread.messagePaginator.state.getLatestValue().hasMoreTail).to.be.true;

          // A fresh hydrate (as produced by reload/ThreadManager on reconnect): the existing reply
          // edited + a brand-new reply that arrived while the connection was dropped.
          const editedReply = generateMsg({
            id: existingReply.id,
            parent_id: parentMessageResponse.id,
            created_at: '2020-01-01T00:00:00.000Z',
            text: 'edited',
          }) as MessageResponse;
          const newReply = generateMsg({
            parent_id: parentMessageResponse.id,
            created_at: '2020-01-02T00:00:00.000Z',
          }) as MessageResponse;
          const hydrationThread = createTestThread({
            latest_replies: [editedReply, newReply],
            reply_count: 11,
          });

          thread.hydrateState(hydrationThread);

          const paginatorState = thread.messagePaginator.state.getLatestValue();
          expect(paginatorState.items?.map((reply) => reply.id)).to.deep.equal([
            existingReply.id,
            newReply.id,
          ]);
          expect(thread.messagePaginator.getItem(existingReply.id)?.text).to.equal(
            'edited',
          );
          // Merging a partial newest window must not clear "load older".
          expect(paginatorState.hasMoreTail).to.be.true;
        });

        it('refreshes the store parent so the projection is not clobbered by a stale copy', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();
          // registering seeds the store with the parent the thread currently holds
          expect(client.messageStore.get(thread.id)?.text).to.equal(
            parentMessageResponse.text,
          );

          // A fresh re-query (reload / reconnect) carries an edited parent.
          const hydrationThread = createTestThread({
            parentMessageOverrides: { text: 'edited-on-server' },
          });
          thread.hydrateState(hydrationThread);

          // Both the projection AND the store's canonical copy are the hydrated parent (no
          // divergence). Regression: hydrateState used to update only state.parentMessage, leaving
          // the store on the pre-hydrate copy, so the next store write for this id would fan the
          // stale parent back over the edit.
          expect(thread.state.getLatestValue().parentMessage.text).to.equal(
            'edited-on-server',
          );
          expect(client.messageStore.get(thread.id)?.text).to.equal('edited-on-server');
        });
      });

      describe('unregisterSubscriptions', () => {
        it('releases the reply paginator hold on the shared message store', () => {
          const reply = makeReply();
          const thread = createTestThread();
          thread.registerSubscriptions();
          thread.upsertReplyLocally({ message: reply });

          // the reply is held in the client-global store by the reply paginator
          expect(client.messageStore.has(reply.id)).to.be.true;

          thread.unregisterSubscriptions();

          // Regression: a removed thread used to keep its reply paginator linked as a store
          // subscriber, pinning it (and its replies) forever. With no other holder the store GCs
          // the reply and the paginator no longer holds it.
          expect(client.messageStore.has(reply.id)).to.be.false;
          expect(thread.messagePaginator.getItem(reply.id)).to.be.undefined;
        });

        // Behavioral characterization of the store's refcount/reclaim contract via the PUBLIC read
        // API (messageStore.has) — a dual-homed message must survive one holder leaving and only be
        // reclaimed when the LAST holder releases it. This pins the contract independently of how the
        // store implements routing/refcount internally (so it survives a store rearchitecture).
        it('keeps a message a sibling collection still holds after the thread is torn down (dual-home refcount)', () => {
          const thread = createTestThread();
          // The channel list also holds the parent message (it is a normal channel message). ingestItem
          // links it into the shared store under the channel paginator, regardless of rendering/filter.
          channel.messagePaginator.ingestItem(formatMessage(parentMessageResponse));
          expect(client.messageStore.has(thread.id)).to.be.true;

          // Opening the thread adds a SECOND holder (its parent-message store subscription).
          thread.registerSubscriptions();
          expect(client.messageStore.has(thread.id)).to.be.true;

          // Tearing down the thread releases ITS hold — but the channel still holds the message, so
          // (unlike the pure-reply case above) it must NOT be reclaimed from the store.
          thread.unregisterSubscriptions();
          expect(client.messageStore.has(thread.id)).to.be.true;

          // Only once the last holder (the channel) drops it is the canonical copy reclaimed.
          channel.messagePaginator.removeItem({ id: thread.id });
          expect(client.messageStore.has(thread.id)).to.be.false;
        });
      });

      describe('reload', () => {
        it('sizes getThread reply_limit to the loaded window, but never below a page', async () => {
          const stub = sinon.stub(client, 'getThread').resolves({
            thread: generateThreadResponse(channelResponse, parentMessageResponse),
          });

          // Unloaded (minimal) thread → a page.
          const minimalThread = createMinimalThread();
          expect(minimalThread.messagePaginator.state.getLatestValue().items).to.be
            .undefined;
          await minimalThread.reload();
          expect(stub.firstCall.args[0]?.reply_limit).to.equal(
            minimalThread.messagePaginator.pageSize,
          );

          // Loaded window LARGER than a page → sized to it, so the whole window reconciles.
          const pageSize = minimalThread.messagePaginator.pageSize;
          const wide = createTestThread({
            latest_replies: Array.from(
              { length: pageSize + 7 },
              () =>
                generateMsg({ parent_id: parentMessageResponse.id }) as MessageResponse,
            ),
            reply_count: pageSize + 20,
          });
          await wide.reload();
          expect(stub.secondCall.args[0]?.reply_limit).to.equal(pageSize + 7);

          // ⚠️ Loaded window SMALLER than a page → still a page. Regression guard: a thread created in
          // the current session holds exactly one reply (the one just sent), and sizing the request to
          // that asks the server for one reply — so replies added while offline can never be
          // discovered, and the single reply that comes back is disjoint from the loaded window, so
          // the fold rebuilds and drops the user's own reply too.
          const narrow = createTestThread({
            latest_replies: [
              generateMsg({ parent_id: parentMessageResponse.id }) as MessageResponse,
            ],
            reply_count: 40,
          });
          await narrow.reload();
          expect(stub.thirdCall.args[0]?.reply_limit).to.equal(pageSize);
        });

        it('merges the fetched page into a thread whose only reply was ingested live', async () => {
          // A thread created this session has an EMPTY first reply page, so nothing anchors its
          // window and the sent reply lands in a LOGICAL head. `mergeNewestPage` used to require an
          // ANCHORED head, silently discarding every reply the server returned on reconnect — and
          // re-entering never healed it, since the instance is reused with `items` already defined.
          const thread = createMinimalThread();
          expect(thread.messagePaginator.state.getLatestValue().items).to.be.undefined;

          // The sent reply — live-ingested, no page behind it.
          const mine = formatMessage(
            makeReply({ id: 'mine', created_at: '2020-01-01T00:00:01.000Z' }),
          );
          thread.messagePaginator.ingestItem(mine);
          expect(repliesOf(thread).map((r) => r.id)).to.eql(['mine']);

          // Two replies from someone else while offline; the server returns all three.
          const peer1 = makeReply({
            id: 'peer1',
            created_at: '2020-01-01T00:00:02.000Z',
          });
          const peer2 = makeReply({
            id: 'peer2',
            created_at: '2020-01-01T00:00:03.000Z',
          });
          sinon.stub(client, 'getThreadAndHydrate').resolves(
            createTestThread({
              latest_replies: [
                makeReply({ id: 'mine', created_at: '2020-01-01T00:00:01.000Z' }),
                peer1,
                peer2,
              ],
              reply_count: 3,
            }),
          );

          await thread.reload();

          expect(repliesOf(thread).map((r) => r.id)).to.eql(['mine', 'peer1', 'peer2']);
        });

        it('anchors the fetched page without yanking the view when the caller has jumped away', async () => {
          // Same rule as the jumped-away branch: anchor for later, never switch the active window
          // out from under someone reading an older island.
          const thread = createMinimalThread();
          const mine = formatMessage(
            makeReply({ id: 'mine', created_at: '2020-01-01T00:00:05.000Z' }),
          );
          thread.messagePaginator.ingestItem(mine);

          // Simulate a jump: an older, separately-anchored island that is the active window.
          const older = [
            makeReply({ id: 'old1', created_at: '2019-01-01T00:00:01.000Z' }),
            makeReply({ id: 'old2', created_at: '2019-01-01T00:00:02.000Z' }),
          ].map((r) => formatMessage(r));
          const jumped = thread.messagePaginator.ingestPage({
            page: older,
            isHead: false,
            setActive: true,
          });
          expect(jumped).to.not.equal(undefined);
          const activeBefore = repliesOf(thread).map((r) => r.id);
          expect(activeBefore).to.eql(['old1', 'old2']);

          sinon.stub(client, 'getThreadAndHydrate').resolves(
            createTestThread({
              latest_replies: [
                makeReply({ id: 'mine', created_at: '2020-01-01T00:00:05.000Z' }),
                makeReply({ id: 'peer1', created_at: '2020-01-01T00:00:06.000Z' }),
              ],
              reply_count: 2,
            }),
          );

          await thread.reload();

          // Still reading the old island — not relocated to the newest page.
          expect(repliesOf(thread).map((r) => r.id)).to.eql(activeBefore);
        });

        it('falls back to the server default when the paginator has no page size', async () => {
          // `pageSize` is optional on the paginator config. Guarding it matters: `Math.max(n,
          // undefined)` is NaN, and a zero page size would ask for no replies at all.
          const stub = sinon.stub(client, 'getThread').resolves({
            thread: generateThreadResponse(channelResponse, parentMessageResponse),
          });
          const thread = createTestThread({
            latest_replies: [],
            reply_count: 0,
          });
          thread.messagePaginator.updateConfig({ pageSize: undefined });

          await thread.reload();

          const limit = stub.firstCall.args[0]?.reply_limit;
          expect(limit).to.equal(undefined);
          expect(Number.isNaN(limit as number)).to.equal(false);
        });

        it('removes a reply hard-deleted while offline and keeps one that arrived during the fetch', async () => {
          // End-to-end through the REAL reload orchestration (not a hand-built snapshot): this is what
          // proves the snapshot-before-await guarantee — the thing the paginator-level tests assume.
          const r1 = makeReply({ id: 'r1', created_at: '2020-01-01T00:00:01.000Z' });
          const r2 = makeReply({ id: 'r2', created_at: '2020-01-01T00:00:02.000Z' });
          // r3 is the newest loaded reply — hard-deleted by someone else while we were offline.
          const r3 = makeReply({ id: 'r3', created_at: '2020-01-01T00:00:03.000Z' });
          const thread = createTestThread({
            latest_replies: [r1, r2, r3],
            reply_count: 3,
          });
          expect(repliesOf(thread).map((reply) => reply.id)).to.eql(['r1', 'r2', 'r3']);

          // A brand-new reply that lands via WS DURING the reload fetch — after reload() snapshots the
          // loaded ids, before hydrateState runs. Like the r3 ghost it is absent from the server page,
          // so a naive "loaded − serverPage" would wrongly drop it; the pre-fetch snapshot must save it.
          const r4 = makeReply({ id: 'r4', created_at: '2020-01-01T00:00:04.000Z' });

          // The server's authoritative page (computed before r4 existed) has r3 hard-deleted, no r4.
          const hydrationThread = createTestThread({
            latest_replies: [r1, r2],
            reply_count: 2,
          });

          sinon.stub(client, 'getThreadAndHydrate').callsFake(async () => {
            thread.messagePaginator.ingestItem(formatMessage(r4)); // live arrival during the await
            return hydrationThread;
          });

          await thread.reload();

          // r3 (in the pre-fetch snapshot, absent from the server page) → hard-delete, removed.
          // r4 (arrived AFTER the snapshot) → not in the snapshot → kept.
          expect(repliesOf(thread).map((reply) => reply.id)).to.eql(['r1', 'r2', 'r4']);
        });

        it('preserves a failed (unsent) reply across a rebuild', async () => {
          // The failed reply is read out of the reply PAGINATOR, not out of `failedRepliesMap`. That
          // map is only written by `upsertReplyLocally`, whose callers are this thread's own
          // subscriptions and the offline-DB path keyed on `ThreadManager.threadsById` — so for a
          // thread constructed directly and never registered (what the React Native SDK does via
          // `threadsById[id] ?? new Thread(...)`) it is always empty, and relying on it would drop the
          // user's unsent reply on every reconnect.
          const r1 = makeReply({ id: 'r1', created_at: '2020-01-01T00:00:01.000Z' });
          const thread = createTestThread({ latest_replies: [r1], reply_count: 1 });
          expect(thread.hasSubscriptions).to.equal(false);

          // A reply the user sent while offline, which failed. It only exists locally, and like any
          // just-attempted send it is the newest thing in the thread.
          const failed = formatMessage(
            makeReply({ id: 'failed-1', created_at: '2021-06-01T00:00:09.000Z' }),
          );
          failed.status = 'failed';
          thread.messagePaginator.ingestItem(failed);
          expect(repliesOf(thread).map((reply) => reply.id)).to.contain('failed-1');

          // Server page is disjoint from the loaded window, which forces a rebuild — the one case the
          // reconcile's provenance guard does not cover.
          const far1 = makeReply({ id: 'far1', created_at: '2021-06-01T00:00:01.000Z' });
          const far2 = makeReply({ id: 'far2', created_at: '2021-06-01T00:00:02.000Z' });
          const hydrationThread = createTestThread({
            latest_replies: [far1, far2],
            reply_count: 2,
          });
          sinon.stub(client, 'getThreadAndHydrate').resolves(hydrationThread);

          await thread.reload();

          expect(repliesOf(thread).map((reply) => reply.id)).to.contain('failed-1');
        });

        it('publishes a reload failure on state.lastReloadError and rethrows it', async () => {
          // Connection recovery runs `reload()` inside `Promise.allSettled`, so the throw never
          // reaches a UI. Mirrors `channel.state.lastReloadError`.
          const thread = createTestThread({ latest_replies: [], reply_count: 0 });
          const failure = new Error('thread reload failed');
          const stub = sinon.stub(client, 'getThreadAndHydrate').rejects(failure);

          await expect(thread.reload()).rejects.toThrow(failure);
          expect(thread.state.getLatestValue().lastReloadError).to.equal(failure);
          // Not left mid-flight — otherwise the isLoading guard would swallow every later reload.
          expect(thread.state.getLatestValue().isLoading).to.equal(false);

          // A later success clears it, so a stale banner cannot outlive the failure it described.
          stub.restore();
          sinon
            .stub(client, 'getThreadAndHydrate')
            .resolves(createTestThread({ latest_replies: [], reply_count: 0 }));
          await thread.reload();
          expect(thread.state.getLatestValue().lastReloadError).to.equal(undefined);
        });
      });

      describe('deleteReplyLocally', () => {
        it('deletes appropriate message', () => {
          const createdAt = new Date().getTime();
          // five messages "created" second apart
          const messages = Array.from(
            { length: 5 },
            (_, i) =>
              generateMsg({
                created_at: new Date(createdAt + 1000 * i),
              }) as MessageResponse,
          );
          const thread = createTestThread({ latest_replies: messages });

          const repliesBefore = repliesOf(thread);
          expect(repliesBefore).to.have.lengthOf(5);

          const messageToDelete = generateMsg({
            created_at: messages[2].created_at,
            id: messages[2].id,
          }) as MessageResponse;

          thread.deleteReplyLocally({ message: messageToDelete });

          const repliesAfter = repliesOf(thread);
          expect(repliesAfter).to.not.equal(repliesBefore);
          expect(repliesAfter).to.have.lengthOf(4);
          expect(repliesAfter.find((reply) => reply.id === messageToDelete.id)).to.be
            .undefined;
        });
      });

      describe('markAsRead', () => {
        let stubbedChannelMarkRead: sinon.SinonStub<
          Parameters<Channel['markRead']>,
          ReturnType<Channel['markRead']>
        >;

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

          expect(stubbedChannelMarkRead.calledOnceWith({ thread_id: thread.id })).to.be
            .true;
        });
      });

      // Reply pagination now flows through the instance's messagePaginator (toTail = older,
      // toHead = newer) — the replacement for the removed Thread.loadNextPage/loadPrevPage. The
      // paginator's own suite covers the query-shape/cursor mechanics; these assert the end-to-end
      // wiring through a real Thread (seeded from latest_replies) which the paginator suite doesn't.
      describe('reply pagination (messagePaginator)', () => {
        it('loads older replies via toTail() and scopes the request to the thread parent', async () => {
          // Seeded newest window with older replies still to load (reply_count > loaded).
          const newest = makeReply({ created_at: '2020-01-03T00:00:00.000Z' });
          const thread = createTestThread({ latest_replies: [newest], reply_count: 3 });
          expect(thread.messagePaginator.state.getLatestValue().hasMoreTail).to.be.true;

          const older = makeReply({ created_at: '2020-01-02T00:00:00.000Z' });
          const getRepliesStub = sinon
            .stub(thread.channel.getClient(), 'getReplies')
            .resolves({ messages: [older], duration: '' } as unknown as ReturnType<
              StreamChat['getReplies']
            >);

          await thread.messagePaginator.toTail();

          // The fetched older reply is now in the rendered reply list...
          expect(repliesOf(thread).map((reply) => reply.id)).to.include(older.id);
          // ...and the request was made against this thread's parent (the replies endpoint).
          expect(getRepliesStub.calledOnce).to.be.true;
          expect(getRepliesStub.firstCall.args[0].parent_id).to.equal(thread.id);
        });

        it('clears hasMoreTail once toTail() reaches the start of the reply list', async () => {
          const newest = makeReply({ created_at: '2020-01-03T00:00:00.000Z' });
          const thread = createTestThread({ latest_replies: [newest], reply_count: 2 });
          expect(thread.messagePaginator.state.getLatestValue().hasMoreTail).to.be.true;

          const older = makeReply({ created_at: '2020-01-02T00:00:00.000Z' });
          sinon
            .stub(thread.channel.getClient(), 'getReplies')
            .resolves({ messages: [older], duration: '' } as unknown as ReturnType<
              StreamChat['getReplies']
            >);

          await thread.messagePaginator.toTail();

          expect(thread.messagePaginator.state.getLatestValue().hasMoreTail).to.be.false;
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
        const stubbedMarkRead = sinon
          .stub(client.messageDeliveryReporter, 'throttledMarkRead')
          .returns(undefined);
        expect(stateBefore.active).to.be.false;
        expect(thread.ownUnreadCount).to.equal(42);
        expect(stubbedMarkRead.called).to.be.false;

        thread.activate();
        clock.runAll();

        const stateAfter = thread.state.getLatestValue();
        expect(stateAfter.active).to.be.true;
        expect(stubbedMarkRead.calledOnce).to.be.true;

        client.dispatchEvent({
          type: 'message.new',
          message: generateMsg({
            parent_id: thread.id,
            user: { id: 'bob' },
          }) as MessageResponse,
          user: { id: 'bob' },
        });
        clock.runAll();

        expect(stubbedMarkRead.calledTwice).to.be.true;

        thread.unregisterSubscriptions();
        clock.restore();
      });

      it('reloads stale state when thread is active', async () => {
        const initialReply = makeReply({ created_at: '2020-03-01T00:00:00.000Z' });
        const thread = createTestThread({
          latest_replies: [initialReply],
          reply_count: 1,
        });
        thread.registerSubscriptions();

        const reloadedReply = makeReply({ created_at: '2020-03-01T00:00:01.000Z' });
        const stubbedGetThread = sinon.stub(client, 'getThreadAndHydrate').resolves(
          createTestThread({
            latest_replies: [initialReply, reloadedReply],
            reply_count: 2,
          }),
        );

        thread.state.partialNext({ isStateStale: true });

        expect(thread.hasStaleState).to.be.true;
        expect(stubbedGetThread.called).to.be.false;

        thread.activate();

        expect(stubbedGetThread.calledOnce).to.be.true;
        await stubbedGetThread.firstCall.returnValue;
        expect(repliesOf(thread).map((reply) => reply.id)).to.include(reloadedReply.id);

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
            thread: generateThreadResponse(channelResponse, generateMsg(), {
              title: 'B',
            }),
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
            thread: generateThreadResponse(
              channelResponse,
              generateMsg({ id: parentMessageResponse.id }),
              {
                title: 'B',
              },
            ),
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.title).to.eq('B');
        });

        it('properly handles custom data', () => {
          const customKey1 = uuidv4();
          const customKey2 = uuidv4();

          const thread = createTestThread({
            custom: { [customKey1]: 1, [customKey2]: { key: 1 } },
          });
          thread.registerSubscriptions();

          const stateBefore = thread.state.getLatestValue();

          expect(stateBefore.custom).to.have.keys([customKey1, customKey2]);
          expect(stateBefore.custom[customKey1]).to.equal(1);

          client.dispatchEvent({
            type: 'thread.updated',
            thread: generateThreadResponse(
              channelResponse,
              generateMsg({ id: parentMessageResponse.id }),
              {
                custom: { [customKey1]: 2 },
              },
            ),
          });

          const stateAfter = thread.state.getLatestValue();

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
            cid: channelResponse.cid,
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
            thread: generateThreadResponse(
              channelResponse,
              generateMsg(),
            ) as ThreadStateResponse,
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
            ) as ThreadStateResponse,
            created_at: createdAt.toISOString(),
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.read['bob']?.unreadMessageCount).to.equal(0);
          expect(stateAfter.read['bob']?.lastReadAt.toISOString()).to.equal(
            createdAt.toISOString(),
          );

          thread.unregisterSubscriptions();
        });
      });

      describe('Event: notification.mark_unread', () => {
        it('ignores event from a different thread', () => {
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
          const stateBefore = thread.state.getLatestValue();

          client.dispatchEvent({
            type: 'notification.mark_unread',
            user: { id: TEST_USER_ID },
            created_at: new Date().toISOString(),
            thread_id: uuidv4(),
            unread_messages: 7,
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter).to.equal(stateBefore);
        });

        it('updates read state for the user when marked unread', () => {
          const lastReadMessageId = uuidv4();
          const thread = createTestThread({
            read: [
              {
                last_read: new Date().toISOString(),
                user: { id: TEST_USER_ID },
                unread_messages: 0,
                last_read_message_id: lastReadMessageId,
              },
            ],
          });
          thread.registerSubscriptions();

          const lastReadAt = new Date();
          const createdAt = new Date(Date.now() - 5000);
          const firstUnreadMessageId = uuidv4();

          client.dispatchEvent({
            type: 'notification.mark_unread',
            user: { id: TEST_USER_ID },
            created_at: createdAt.toISOString(),
            last_read_at: lastReadAt.toISOString(),
            thread_id: thread.id,
            first_unread_message_id: firstUnreadMessageId,
            unread_messages: 3,
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.read[TEST_USER_ID]?.unreadMessageCount).to.equal(3);
          expect(stateAfter.read[TEST_USER_ID]?.firstUnreadMessageId).to.equal(
            firstUnreadMessageId,
          );
          expect(stateAfter.read[TEST_USER_ID]?.lastReadAt.toISOString()).to.equal(
            lastReadAt.toISOString(),
          );
          expect(stateAfter.read[TEST_USER_ID]?.lastReadMessageId).to.equal(
            lastReadMessageId,
          );
        });

        it('creates a read entry for a user that did not have one previously', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();

          const otherUserId = 'bob';
          const createdAt = new Date();

          client.dispatchEvent({
            type: 'notification.mark_unread',
            user: { id: otherUserId },
            created_at: createdAt.toISOString(),
            thread_id: thread.id,
            unread_messages: 4,
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.read[otherUserId]?.unreadMessageCount).to.equal(4);
          expect(stateAfter.read[otherUserId]?.user.id).to.equal(otherUserId);
          expect(stateAfter.read[otherUserId]?.lastReadAt.toISOString()).to.equal(
            createdAt.toISOString(),
          );
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

          const newMessage = makeReply({ user: { id: 'bob' } });
          client.dispatchEvent({
            type: 'message.new',
            message: newMessage,
            user: { id: 'bob' },
          });

          expect(repliesOf(thread).map((reply) => reply.id)).to.include(newMessage.id);
          expect(thread.ownUnreadCount).to.equal(1);

          thread.unregisterSubscriptions();
        });

        it('tracks reply_count from the authoritative parent update, not a local increment on new reply', () => {
          const thread = createTestThread({
            reply_count: 0,
            read: [
              {
                last_read: new Date().toISOString(),
                user: { id: TEST_USER_ID },
                unread_messages: 0,
              },
            ],
          });
          thread.registerSubscriptions();

          const newMessage = generateMsg({
            parent_id: thread.id,
            user: { id: 'bob' },
          }) as MessageResponse;

          // A received reply must NOT locally bump replyCount. The count is kept authoritative by
          // the parent's server-driven reply_count (below); a local increment double-counted
          // received replies on top of that re-sync (see subscribeNewReplies).
          client.dispatchEvent({
            type: 'message.new',
            message: newMessage,
            user: { id: 'bob' },
          });
          expect(thread.state.getLatestValue().replyCount).to.equal(0);

          // The server delivers the authoritative reply_count via the parent's message.updated.
          client.dispatchEvent({
            type: 'message.updated',
            message: { ...parentMessageResponse, reply_count: 1 } as MessageResponse,
            user: { id: 'bob' },
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.replyCount).to.equal(1);
          expect(stateAfter.parentMessage.reply_count).to.equal(1);

          thread.unregisterSubscriptions();
        });

        it('does not change local reply_count on message.new (parent-message-driven, so duplicates are harmless)', () => {
          const existingReply = generateMsg({
            parent_id: parentMessageResponse.id,
            user: { id: 'bob' },
          }) as MessageResponse;
          const thread = createTestThread({
            latest_replies: [existingReply],
            reply_count: 1,
            parentMessageOverrides: { reply_count: 1 },
            read: [
              {
                user: { id: TEST_USER_ID },
                last_read: new Date().toISOString(),
                unread_messages: 0,
              },
            ],
          });
          thread.registerSubscriptions();

          // reply_count is sourced from the parent message, so it starts at 1.
          expect(thread.state.getLatestValue().replyCount).to.equal(1);

          // A message.new (here a duplicate of an already-loaded reply) must not locally change the
          // count — the authoritative reply_count comes from the parent message, so this is a no-op.
          client.dispatchEvent({
            type: 'message.new',
            message: existingReply,
            user: { id: 'bob' },
          });

          const stateAfter = thread.state.getLatestValue();
          expect(stateAfter.replyCount).to.equal(1);
          expect(stateAfter.parentMessage.reply_count).to.equal(1);

          thread.unregisterSubscriptions();
        });

        it('handles receiving a reply that was previously optimistically added', () => {
          const thread = createTestThread({
            latest_replies: [makeReply()],
            reply_count: 1,
            read: [
              {
                user: { id: TEST_USER_ID },
                last_read: new Date().toISOString(),
                unread_messages: 0,
              },
            ],
          });
          const message = makeReply({ user: { id: TEST_USER_ID } });
          thread.upsertReplyLocally({ message });

          expect(repliesOf(thread)).to.have.length(2);
          expect(thread.ownUnreadCount).to.equal(0);

          client.dispatchEvent({
            type: 'message.new',
            message,
            user: { id: TEST_USER_ID },
          });

          // Receiving the same reply over the WS must not duplicate it.
          expect(repliesOf(thread)).to.have.length(2);
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
                created_at: new Date(createdAt + 1000 * i),
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

          const replies = repliesOf(thread);
          expect(replies).to.have.lengthOf(4);
          expect(replies.find((reply) => reply.id === messageToDelete.id)).to.be
            .undefined;

          thread.unregisterSubscriptions();
        });

        it('updates deleted_at property of the reply if it was soft deleted', () => {
          const createdAt = new Date().getTime();
          // five messages "created" second apart
          const messages = Array.from({ length: 5 }, (_, i) =>
            makeReply({ created_at: new Date(createdAt + 1000 * i).toISOString() }),
          );
          const thread = createTestThread({ latest_replies: messages, reply_count: 5 });
          thread.registerSubscriptions();

          const messageToDelete = messages[2];

          expect(messageToDelete.deleted_at).to.be.undefined;

          const deletedAt = new Date();
          client.dispatchEvent({
            type: 'message.deleted',
            message: {
              ...messageToDelete,
              type: 'deleted',
              deleted_at: deletedAt,
            },
          });

          // Soft delete routes through upsertReplyLocally, so the reply is retained (marked) in place.
          const replies = repliesOf(thread);
          expect(replies).to.have.lengthOf(5);
          expect(replies[2].id).to.equal(messageToDelete.id);
          expect(replies[2]).to.not.equal(messageToDelete);
          expect(replies[2].deleted_at).to.be.a('date');
          expect(replies[2].deleted_at!.toISOString()).to.equal(deletedAt.toISOString());
          expect(replies[2].type).to.equal('deleted');

          thread.unregisterSubscriptions();
        });

        it('handles deletion of the thread (updates deleted_at and parentMessage properties)', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();

          const stateBefore = thread.state.getLatestValue();

          const parentMessage = generateMsg({
            id: thread.id,
            deleted_at: new Date(),
            type: 'deleted',
          }) as MessageResponse;

          expect(thread.id).to.equal(parentMessage.id);
          expect(stateBefore.deletedAt).to.be.null;

          client.dispatchEvent({ type: 'message.deleted', message: parentMessage });

          const stateAfter = thread.state.getLatestValue();

          expect(stateAfter.deletedAt).to.be.a('date');
          expect(stateAfter.deletedAt!.toISOString()).to.equal(
            parentMessage.deleted_at!.toISOString(),
          );
          expect(stateAfter.parentMessage.deleted_at).to.be.a('date');
          expect(stateAfter.parentMessage.deleted_at!.toISOString()).to.equal(
            parentMessage.deleted_at!.toISOString(),
          );
        });

        it('reflects quoted_message updates in messagePaginator cache', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();

          const quotedMessage = generateMsg({
            id: uuidv4(),
            text: 'before delete',
          }) as MessageResponse;
          const quoteCarrier = generateMsg({
            id: uuidv4(),
            parent_id: thread.id,
            quoted_message_id: quotedMessage.id,
            quoted_message: quotedMessage,
          }) as MessageResponse;

          thread.messagePaginator.setItems({
            valueOrFactory: [quoteCarrier].map(formatMessage),
            isFirstPage: true,
            isLastPage: true,
          });

          client.dispatchEvent({
            type: 'message.deleted',
            message: {
              ...quotedMessage,
              type: 'deleted',
              deleted_at: new Date().toISOString(),
            },
          });

          expect(
            thread.messagePaginator.getItem(quoteCarrier.id)?.quoted_message?.type,
          ).to.equal('deleted');

          thread.unregisterSubscriptions();
        });
      });

      describe('Events: message.updated, reaction.new, reaction.deleted', () => {
        // Reaction events are routed through messagePaginator.reflectReaction (see the "ingests"
        // tests below); only message-update events go through updateParentMessageOrReplyLocally.
        (['message.updated', 'message.undeleted'] as const).forEach((eventType) => {
          it(`updates reply or parent message on "${eventType}"`, () => {
            const thread = createTestThread();
            const updateParentMessageOrReplyLocallySpy = sinon.spy(
              thread,
              'updateParentMessageOrReplyLocally',
            );
            thread.registerSubscriptions();

            client.dispatchEvent({
              type: eventType,
              message: generateMsg({ parent_id: thread.id }) as MessageResponse,
            });

            expect(updateParentMessageOrReplyLocallySpy.calledOnce).to.be.true;

            thread.unregisterSubscriptions();
          });
        });

        it("preserves the current user's own_reactions on a cross-user reaction to a reply", () => {
          const thread = createTestThread();
          thread.registerSubscriptions();
          const messageId = uuidv4();
          // Seed a reply that already carries the current user's own reaction.
          thread.messagePaginator.ingestItem(
            formatMessage(
              generateMsg({
                id: messageId,
                parent_id: thread.id,
                own_reactions: [
                  { type: 'love', user_id: TEST_USER_ID, message_id: messageId },
                ],
              }) as MessageResponse,
            ),
          );

          // A different user reacts; the WS event message carries own_reactions: [].
          client.dispatchEvent({
            type: 'reaction.new',
            message: generateMsg({
              id: messageId,
              parent_id: thread.id,
              own_reactions: [],
            }) as MessageResponse,
            reaction: {
              type: 'like',
              user_id: 'other-user',
              message_id: messageId,
              created_at: new Date().toISOString(),
            },
          });

          const own = thread.messagePaginator.getItem(messageId)?.own_reactions ?? [];
          expect(own.some((r) => r.type === 'love' && r.user_id === TEST_USER_ID)).to.be
            .true;
          // The other user's reaction is not added to the current user's own_reactions.
          expect(own.some((r) => r.user_id === 'other-user')).to.be.false;

          thread.unregisterSubscriptions();
        });

        (['user.messages.deleted', 'user.deleted'] as const).forEach((eventType) => {
          it(`soft-deletes a banned user's replies in the thread paginator on "${eventType}"`, () => {
            const thread = createTestThread();
            thread.registerSubscriptions();
            const bannedUserId = 'banned-user';
            const replyId = uuidv4();
            thread.messagePaginator.ingestPage({
              page: [
                formatMessage(
                  generateMsg({
                    id: replyId,
                    parent_id: thread.id,
                    user: { id: bannedUserId },
                  }) as MessageResponse,
                ),
              ],
              isHead: true,
              isTail: true,
              setActive: true,
            });

            client.dispatchEvent({
              type: eventType,
              user: { id: bannedUserId, deleted_at: new Date().toISOString() },
              created_at: new Date().toISOString(),
            });

            expect(thread.messagePaginator.getItem(replyId)?.type).to.equal('deleted');

            thread.unregisterSubscriptions();
          });
        });

        it('ingests "reaction.new" message into thread messagePaginator when parent_id matches thread.id', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();
          const message = generateMsg({
            id: uuidv4(),
            parent_id: thread.id,
          }) as MessageResponse;

          client.dispatchEvent({
            type: 'reaction.new',
            message,
            reaction: {
              type: 'love',
              user_id: TEST_USER_ID,
              message_id: message.id,
              created_at: new Date().toISOString(),
            },
          });

          expect(thread.messagePaginator.getItem(message.id)?.id).to.equal(message.id);

          thread.unregisterSubscriptions();
        });

        it('ignores "reaction.new" message in thread messagePaginator when parent_id does not match thread.id', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();
          const message = generateMsg({
            id: uuidv4(),
            parent_id: uuidv4(),
          }) as MessageResponse;

          client.dispatchEvent({
            type: 'reaction.new',
            message,
            reaction: {
              type: 'love',
              user_id: TEST_USER_ID,
              message_id: message.id,
              created_at: new Date().toISOString(),
            },
          });

          expect(thread.messagePaginator.getItem(message.id)).to.be.undefined;

          thread.unregisterSubscriptions();
        });

        (['reaction.deleted', 'reaction.updated'] as const).forEach((eventType) => {
          it(`ingests "${eventType}" message into thread messagePaginator when parent_id matches thread.id`, () => {
            const thread = createTestThread();
            thread.registerSubscriptions();
            const message = generateMsg({
              id: uuidv4(),
              parent_id: thread.id,
            }) as MessageResponse;

            client.dispatchEvent({
              type: eventType,
              message,
              reaction: {
                type: 'love',
                user_id: TEST_USER_ID,
                message_id: message.id,
                created_at: new Date().toISOString(),
              },
            });

            expect(thread.messagePaginator.getItem(message.id)?.id).to.equal(message.id);

            thread.unregisterSubscriptions();
          });

          it(`ignores "${eventType}" message in thread messagePaginator when parent_id does not match thread.id`, () => {
            const thread = createTestThread();
            thread.registerSubscriptions();
            const message = generateMsg({
              id: uuidv4(),
              parent_id: uuidv4(),
            }) as MessageResponse;

            client.dispatchEvent({
              type: eventType,
              message,
              reaction: {
                type: 'love',
                user_id: TEST_USER_ID,
                message_id: message.id,
                created_at: new Date().toISOString(),
              },
            });

            expect(thread.messagePaginator.getItem(message.id)).to.be.undefined;

            thread.unregisterSubscriptions();
          });
        });

        it('reflects quoted_message updates in messagePaginator on "message.updated"', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();

          const quotedMessage = generateMsg({
            id: uuidv4(),
            text: 'before update',
          }) as MessageResponse;
          const quoteCarrier = generateMsg({
            id: uuidv4(),
            parent_id: thread.id,
            quoted_message_id: quotedMessage.id,
            quoted_message: quotedMessage,
          }) as MessageResponse;

          thread.messagePaginator.setItems({
            valueOrFactory: [quoteCarrier].map(formatMessage),
            isFirstPage: true,
            isLastPage: true,
          });

          client.dispatchEvent({
            type: 'message.updated',
            message: { ...quotedMessage, text: 'after update' },
          });

          expect(
            thread.messagePaginator.getItem(quoteCarrier.id)?.quoted_message?.text,
          ).to.equal('after update');

          thread.unregisterSubscriptions();
        });

        it('reflects quoted_message updates in messagePaginator on "message.undeleted"', () => {
          const thread = createTestThread();
          thread.registerSubscriptions();

          const quotedMessage = generateMsg({
            id: uuidv4(),
            text: 'before undelete',
            type: 'deleted',
          }) as MessageResponse;
          const quoteCarrier = generateMsg({
            id: uuidv4(),
            parent_id: thread.id,
            quoted_message_id: quotedMessage.id,
            quoted_message: quotedMessage,
          }) as MessageResponse;

          thread.messagePaginator.setItems({
            valueOrFactory: [quoteCarrier].map(formatMessage),
            isFirstPage: true,
            isLastPage: true,
          });

          client.dispatchEvent({
            type: 'message.undeleted',
            message: { ...quotedMessage, type: 'regular', text: 'after undelete' },
          });

          expect(
            thread.messagePaginator.getItem(quoteCarrier.id)?.quoted_message?.text,
          ).to.equal('after undelete');
          expect(
            thread.messagePaginator.getItem(quoteCarrier.id)?.quoted_message?.type,
          ).to.equal('regular');

          thread.unregisterSubscriptions();
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
        expect(threadManager.state.getLatestValue()).to.be.deep.equal(
          THREAD_MANAGER_INITIAL_STATE,
        );
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
      expect(
        clientWithUser.threads.state.getLatestValue().unseenThreadIds,
      ).to.have.lengthOf(0);
    });

    describe('Subscription and Event Handlers', () => {
      beforeEach(() => {
        threadManager.registerSubscriptions();
      });

      afterEach(() => {
        threadManager.unregisterSubscriptions();
        sinon.restore();
      });

      (
        [
          ['health.check', 2],
          ['notification.mark_read', 1],
          ['notification.mark_unread', 5],
          ['notification.thread_message_new', 8],
          ['notification.channel_deleted', 11],
        ] as const
      ).forEach(([eventType, expectedUnreadCount]) => {
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

          expect(threadManager.state.getLatestValue().unseenThreadIds).to.have.lengthOf(
            1,
          );
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

          expect(threadManager.state.getLatestValue().unseenThreadIds).to.have.lengthOf(
            1,
          );
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

      it('reloads after connection drop if the thread list was activated at least once', () => {
        const thread = createTestThread();
        threadManager.state.partialNext({
          threads: [thread],
          wasActivatedAtLeastOnce: true,
        });
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

      it('does not reload after connection drop if the thread list was never activated', () => {
        const thread = createTestThread();
        threadManager.state.partialNext({ threads: [thread] });
        threadManager.registerSubscriptions();
        const stub = sinon.stub(client, 'queryThreadsAndHydrate').resolves({
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

        expect(stub.called).to.be.false;

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
        const [thread1, registerThread1, unregisterThread1] =
          createTestThreadAndSpySubscriptions();
        const [thread2, registerThread2, unregisterThread2] =
          createTestThreadAndSpySubscriptions();
        const [thread3, registerThread3, unregisterThread3] =
          createTestThreadAndSpySubscriptions();

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
        stubbedQueryThreads = sinon.stub(client, 'queryThreadsAndHydrate').resolves({
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
          expect(stubbedQueryThreads.firstCall.calledWithMatch({ limit: 25 })).to.be.true;
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
          const existingThread = createTestThread({
            parentMessageOverrides: { id: uuidv4() },
          });
          const newThread = createTestThread({
            parentMessageOverrides: { id: uuidv4() },
          });
          threadManager.state.partialNext({
            threads: [existingThread],
            unseenThreadIds: [newThread.id],
          });
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
            thread_participants: [
              { user_id: 'u1' },
            ] as ThreadStateResponse['thread_participants'],
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
          const existingThread = createTestThread({
            parentMessageOverrides: { id: uuidv4() },
          });
          const newThread1 = createTestThread({
            parentMessageOverrides: { id: uuidv4() },
          });
          const newThread2 = createTestThread({
            parentMessageOverrides: { id: uuidv4() },
          });
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
          const existingThread = createTestThread({
            parentMessageOverrides: { id: uuidv4() },
          });
          const newThread = createTestThread({
            parentMessageOverrides: { id: uuidv4() },
          });
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

      describe('queryThreads', () => {
        it('forms correct request with default parameters', async () => {
          await threadManager.queryThreads();

          expect(
            stubbedQueryThreads.calledWithMatch({
              limit: 25,
              participant_limit: 10,
              reply_limit: 10,
              watch: true,
            }),
          ).to.be.true;
        });

        it('applies filter parameters correctly', async () => {
          const filter: ThreadFilters = {
            created_at: { $gt: '2024-01-01T00:00:00Z' },
          };

          await threadManager.queryThreads({ filter });

          expect(
            stubbedQueryThreads.calledWithMatch({
              limit: 25,
              participant_limit: 10,
              reply_limit: 10,
              watch: true,
              filter,
            }),
          ).to.be.true;
        });

        it('applies sort parameters correctly', async () => {
          const sort: SortParamRequest[] = [
            { field: 'created_at', direction: -1 },
            { field: 'last_message_at', direction: 1 },
          ];

          await threadManager.queryThreads({ sort });

          expect(
            stubbedQueryThreads.calledWithMatch({
              limit: 25,
              participant_limit: 10,
              reply_limit: 10,
              watch: true,
              sort,
            }),
          ).to.be.true;
        });

        it('applies both filter and sort parameters correctly', async () => {
          const filter: ThreadFilters = {
            created_by_user_id: { $eq: 'user1' },
            updated_at: { $gte: '2024-01-01T00:00:00Z' },
          };
          const sort: SortParamRequest[] = [{ field: 'last_message_at', direction: -1 }];

          await threadManager.queryThreads({ filter, sort });

          expect(
            stubbedQueryThreads.calledWithMatch({
              limit: 25,
              participant_limit: 10,
              reply_limit: 10,
              watch: true,
              filter,
              sort,
            }),
          ).to.be.true;
        });

        it('handles empty filter and sort parameters', async () => {
          await threadManager.queryThreads({});

          expect(
            stubbedQueryThreads.calledWithMatch({
              limit: 25,
              participant_limit: 10,
              reply_limit: 10,
              watch: true,
            }),
          ).to.be.true;
        });
      });
    });
  });
});
