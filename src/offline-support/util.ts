import type { Attachment, LocalMessage, MessageResponse } from '../types';

export const isLocalUrl = (value: string | undefined) =>
  !!value && !value.startsWith('http');

export const isAttachmentReplayable = (attachment: Attachment) => {
  if (!attachment || typeof attachment !== 'object') {
    return true;
  }

  return !isLocalUrl(attachment.asset_url) && !isLocalUrl(attachment.image_url);
};

export const isMessageUpdateReplayable = (
  message: LocalMessage | Partial<MessageResponse>,
) => !message.attachments?.some((attachment) => !isAttachmentReplayable(attachment));

export const getPendingTaskChannelData = (cid?: string) => {
  if (!cid) {
    return {};
  }

  const separatorIndex = cid.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === cid.length - 1) {
    return {};
  }

  return {
    channelId: cid.slice(separatorIndex + 1),
    channelType: cid.slice(0, separatorIndex),
  };
};
