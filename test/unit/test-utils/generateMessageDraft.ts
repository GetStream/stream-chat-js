import { generateChannel } from './generateChannel';
import { generateMsg } from './generateMessage';
import type { ChannelResponse, DraftResponse } from '../../../src';

export const generateMessageDraft = ({
  channel: customChannel,
  channel_cid,
  ...customMsgDraft
}: Partial<DraftResponse>) => {
  const channel = (customChannel ?? generateChannel()) as ChannelResponse;
  return {
    channel,
    channel_cid: channel.cid,
    created_at: new Date().toISOString(),
    message: generateMsg(),
    ...customMsgDraft,
  } as DraftResponse;
};
