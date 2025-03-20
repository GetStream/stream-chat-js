import type { MiddlewareValue } from '../../../middleware';
import type {
  Attachment,
  MessageLabel,
  SendMessageOptions,
  UserResponse,
} from '../../../types';

export type MessageComposerMiddlewareValue = MiddlewareValue<{
  message: {
    attachments: Attachment[];
    id: string;
    linkPreviews: Attachment[];
    mentioned_users?: UserResponse[];
    text: string;
    type: MessageLabel;
    parent_id?: string;
    poll_id?: string;
    quoted_message_id?: string;
  };
  sendOptions: SendMessageOptions;
}>;
