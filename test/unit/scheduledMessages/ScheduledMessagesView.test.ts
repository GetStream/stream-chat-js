import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ScheduledMessagePaginator,
  ScheduledMessageResponse,
  ScheduledMessagesView,
  StreamChat,
  Thread,
} from '../../../src';
import { msToNs, nowNs } from '../../../src/utils/time';
import { getClientWithUser } from '../test-utils/getClient';
import { mockChannelQueryResponse } from '../test-utils/mockChannelQueryResponse';

const { id: channelId, type: channelType } = mockChannelQueryResponse.channel;
const cid = mockChannelQueryResponse.channel.cid;

const at = (second: number) => msToNs(Date.UTC(2030, 0, 1, 0, 0, second));

const generateScheduledMessage = (
  data: Partial<ScheduledMessageResponse> & { parentId?: string } = {},
): ScheduledMessageResponse => {
  const { parentId, ...rest } = data;
  return {
    id: `sm-${Math.random().toString(36).slice(2)}`,
    cid,
    user: { id: 'user1' },
    message: { text: 'see you tomorrow', ...(parentId ? { parent_id: parentId } : {}) },
    scheduled_at: at(10),
    status: 'scheduled',
    created_at: nowNs(),
    updated_at: nowNs(),
    ...rest,
  } as ScheduledMessageResponse;
};

const setup = () => {
  const client = getClientWithUser({ id: 'user1' }) as StreamChat;
  const channel = client.channelManager.ensure({ id: channelId, type: channelType });
  const thread = new Thread({
    channel,
    client,
    parentMessage: { created_at: nowNs(), id: 'parent', text: 'parent' } as never,
  });
  return { channel, client, thread };
};

const items = (view: ScheduledMessagesView) => view.state.getLatestValue().items;

describe('ScheduledMessagesView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists a channel's own scheduled messages, without thread replies", () => {
    const { channel } = setup();
    const inChannel = generateScheduledMessage({ scheduled_at: at(10) });
    const reply = generateScheduledMessage({ parentId: 'parent', scheduled_at: at(20) });

    channel.scheduledMessagesPaginator.hydrate([reply, inChannel]);

    expect(channel.scheduledMessages.scope).toEqual({ type: 'channel' });
    expect(channel.scheduledMessages.paginator).toBe(channel.scheduledMessagesPaginator);
    expect(items(channel.scheduledMessages)).toEqual([inChannel]);
  });

  it('is undefined until its paginator has items, and empty once it has none in scope', () => {
    const { channel } = setup();

    expect(items(channel.scheduledMessages)).toBeUndefined();

    channel.scheduledMessagesPaginator.hydrate([
      generateScheduledMessage({ parentId: 'parent' }),
    ]);

    expect(items(channel.scheduledMessages)).toEqual([]);
  });

  it("lists a thread's scheduled replies once its subscriptions are registered", () => {
    const { channel, thread } = setup();
    const inChannel = generateScheduledMessage();
    const reply = generateScheduledMessage({ parentId: 'parent' });
    const otherReply = generateScheduledMessage({ parentId: 'other-parent' });
    thread.registerSubscriptions();

    channel.scheduledMessagesPaginator.hydrate([inChannel, reply, otherReply]);

    expect(thread.scheduledMessages.scope).toEqual({
      parentId: 'parent',
      type: 'thread',
    });
    expect(thread.scheduledMessages.parentId).toBe('parent');
    expect(items(thread.scheduledMessages)).toEqual([reply]);
  });

  it("follows the channel's paginator: added, updated and removed messages", () => {
    const { channel, thread } = setup();
    thread.registerSubscriptions();
    channel.scheduledMessagesPaginator.hydrate([]);
    const reply = generateScheduledMessage({ parentId: 'parent' });

    channel.scheduledMessagesPaginator.ingestItem(reply);
    expect(items(thread.scheduledMessages)).toEqual([reply]);

    const updated = { ...reply, updated_at: nowNs() + 1, scheduled_at: at(30) };
    channel.scheduledMessagesPaginator.ingestItem(updated);
    expect(items(thread.scheduledMessages)).toEqual([updated]);

    channel.scheduledMessagesPaginator.removeItem({ id: reply.id });
    expect(items(thread.scheduledMessages)).toEqual([]);
  });

  it('keeps the same array when a message outside its scope changes', () => {
    const { channel } = setup();
    channel.scheduledMessagesPaginator.hydrate([generateScheduledMessage()]);
    const before = items(channel.scheduledMessages);
    const listener = vi.fn();
    const unsubscribe = channel.scheduledMessages.state.subscribe(listener);
    listener.mockClear();

    channel.scheduledMessagesPaginator.ingestItem(
      generateScheduledMessage({ parentId: 'parent' }),
    );

    expect(items(channel.scheduledMessages)).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('catches up when a consumer registers it, and stops following when the last one leaves', () => {
    const { channel, thread } = setup();
    const reply = generateScheduledMessage({ parentId: 'parent' });
    channel.scheduledMessagesPaginator.hydrate([reply]);

    // the thread never registered its subscriptions: the view has not followed
    expect(items(thread.scheduledMessages)).toBeUndefined();

    thread.scheduledMessages.registerSubscriptions();
    expect(items(thread.scheduledMessages)).toEqual([reply]);

    thread.scheduledMessages.unregisterSubscriptions();
    channel.scheduledMessagesPaginator.ingestItem(
      generateScheduledMessage({ parentId: 'parent' }),
    );
    expect(items(thread.scheduledMessages)).toEqual([reply]);
  });

  it("keeps following while the thread holds it, after a UI's registration ends", () => {
    const { channel, thread } = setup();
    thread.registerSubscriptions();
    channel.scheduledMessagesPaginator.hydrate([]);

    thread.scheduledMessages.registerSubscriptions();
    thread.scheduledMessages.unregisterSubscriptions();
    const reply = generateScheduledMessage({ parentId: 'parent' });
    channel.scheduledMessagesPaginator.ingestItem(reply);

    expect(items(thread.scheduledMessages)).toEqual([reply]);
  });

  it('stops following when the channel is disconnected', () => {
    const { channel } = setup();
    channel.scheduledMessagesPaginator.hydrate([]);
    const unsubscribe = vi.spyOn(channel.scheduledMessages, 'unregisterSubscriptions');

    channel.disconnect();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("passes every message through with the 'all' scope", () => {
    const { client } = setup();
    const paginator = new ScheduledMessagePaginator({ client });
    const view = new ScheduledMessagesView({ paginator });
    view.registerSubscriptions();
    const inChannel = generateScheduledMessage();
    const reply = generateScheduledMessage({ parentId: 'parent' });

    paginator.hydrate([inChannel, reply]);

    expect(view.scope).toEqual({ type: 'all' });
    expect(items(view)).toBe(paginator.items);
  });

  it("loads the paginator's next page", async () => {
    const { channel } = setup();
    const toTail = vi
      .spyOn(channel.scheduledMessagesPaginator, 'toTail')
      .mockResolvedValue(undefined);

    await channel.scheduledMessages.toTail();

    expect(toTail).toHaveBeenCalledTimes(1);
  });
});
