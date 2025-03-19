import type { Attachment, SendMessageOptions } from '../../../types';

export type MessageComposerMiddlewareValue = {
  state: {
    message: {
      attachments: Attachment[];
      id: string;
      linkPreviews: Attachment[];
      mentioned_users?: string[];
      text: string;
      type: 'regular' | 'system';
      parent_id?: string;
      poll_id?: string;
      quoted_message_id?: string;
    };
    sendOptions: SendMessageOptions;
  };
  stop?: boolean;
};
