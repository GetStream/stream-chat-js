import { describe, expect, it } from 'vitest';
import { getScheduledMessageLimits } from '../../../src';
import { getClientWithUser } from '../test-utils/getClient';
import { stubServerConfig } from '../test-utils/stubServerConfig';

const createChannel = () => {
  const client = getClientWithUser({ id: 'user' });
  client.connectUser();

  return client.channel('messaging', 'limits');
};

describe('getScheduledMessageLimits', () => {
  it('reads the limits from the channel server config', () => {
    const channel = createChannel();
    stubServerConfig(channel, {
      scheduled_messages_max_lead_time_seconds: 3600,
      scheduled_messages_max_per_channel: 3,
      scheduled_messages_max_per_user: 7,
      scheduled_messages_min_lead_time_seconds: 120,
    });

    expect(getScheduledMessageLimits(channel)).toEqual({
      maxLeadTimeSeconds: 3600,
      maxPerChannel: 3,
      maxPerUser: 7,
      minLeadTimeSeconds: 120,
    });
  });

  it('returns no limits when the server config lacks some of them', () => {
    const channel = createChannel();
    stubServerConfig(channel, { scheduled_messages_max_per_channel: 3 });

    expect(getScheduledMessageLimits(channel)).toBeUndefined();
  });

  it('returns no limits without a server config', () => {
    expect(getScheduledMessageLimits(createChannel())).toBeUndefined();
  });
});
