import type { ScheduledMessageResponse } from '../gen/models';

export const getChannelLevelScheduledMessages = (
  scheduledMessages: ScheduledMessageResponse[],
) => {
  const channelLevelScheduledMessages = scheduledMessages.filter(
    ({ message }) => !message.parent_id,
  );

  return channelLevelScheduledMessages;
};

export const getThreadScheduledMessages = (
  scheduledMessages: ScheduledMessageResponse[],
  parentId: string,
) => {
  const threadScheduledMessages = scheduledMessages.filter(
    ({ message }) => message.parent_id === parentId,
  );

  return threadScheduledMessages;
};
