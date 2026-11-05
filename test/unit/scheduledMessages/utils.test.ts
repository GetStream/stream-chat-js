import { describe, expect, it } from 'vitest';
import {
  getChannelLevelScheduledMessages,
  getThreadScheduledMessages,
  ScheduledMessageResponse,
} from '../../../src';

const generateScheduledMessage = (id: string, parentId?: string) =>
  ({
    id,
    cid: 'messaging:general',
    message: { text: id, ...(parentId ? { parent_id: parentId } : {}) },
  }) as ScheduledMessageResponse;

const channelLevel = generateScheduledMessage('channel-level');
const reply = generateScheduledMessage('reply', 'parent');
const otherReply = generateScheduledMessage('other-reply', 'other-parent');
const scheduledMessages = [channelLevel, reply, otherReply];

describe('getChannelLevelScheduledMessages', () => {
  it('keeps the scheduled messages that are not thread replies', () => {
    expect(getChannelLevelScheduledMessages(scheduledMessages)).toEqual([channelLevel]);
  });
});

describe('getThreadScheduledMessages', () => {
  it('keeps the scheduled replies of the thread', () => {
    expect(getThreadScheduledMessages(scheduledMessages, 'parent')).toEqual([reply]);
  });

  it('returns no scheduled messages for a thread without scheduled replies', () => {
    expect(getThreadScheduledMessages(scheduledMessages, 'unknown')).toEqual([]);
  });
});
