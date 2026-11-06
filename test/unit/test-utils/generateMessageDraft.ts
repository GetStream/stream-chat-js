import { generateChannel } from './generateChannel';
import { generateMsg } from './generateMessage';
import { convertDateToTimestamp } from './time';
import type { ChannelResponse, DraftResponse } from '../../../src';

export const generateMessageDraft = ({
  channel: customChannel,
  channel_cid,
  ...customMsgDraft
}: Partial<DraftResponse>) => {
  const { channel: generatedChannel } = generateChannel();
  const channel = customChannel ?? generatedChannel;
  return {
    channel,
    channel_cid: channel.cid,
    created_at: convertDateToTimestamp(),
    message: generateMsg(),
    ...customMsgDraft,
  } as DraftResponse;
};
