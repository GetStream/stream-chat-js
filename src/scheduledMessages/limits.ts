import type { Channel } from '../channel';
import type { ScheduledMessageLimits } from './types';

type ChannelServerConfig = Channel['serverConfig'];

const isLimit = (value: number | undefined): value is number => typeof value === 'number';

export const getScheduledMessageLimitsFromServerConfig = (
  serverConfig: ChannelServerConfig,
): ScheduledMessageLimits | undefined => {
  const {
    scheduled_messages_max_lead_time_seconds: maxLeadTimeSeconds,
    scheduled_messages_max_per_channel: maxPerChannel,
    scheduled_messages_max_per_user: maxPerUser,
    scheduled_messages_min_lead_time_seconds: minLeadTimeSeconds,
  } = serverConfig ?? {};

  const hasEveryLimit =
    isLimit(maxLeadTimeSeconds) &&
    isLimit(maxPerChannel) &&
    isLimit(maxPerUser) &&
    isLimit(minLeadTimeSeconds);

  if (!hasEveryLimit) return undefined;

  const limits = { maxLeadTimeSeconds, maxPerChannel, maxPerUser, minLeadTimeSeconds };

  return limits;
};

export const getScheduledMessageLimits = (channel: Channel) =>
  getScheduledMessageLimitsFromServerConfig(channel.serverConfig);
