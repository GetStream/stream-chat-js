import { LOCAL_MESSAGE_FIELDS, RESERVED_UPDATED_MESSAGE_FIELDS } from '../constants';
import type {
  DraftMessage,
  DraftResponse,
  Message,
  ScheduledMessageResponse,
  UpdatedMessage,
} from '../types';

const SCHEDULED_MESSAGE_SERVER_FIELDS = ['id', 'mml', 'shared_location'];

const SERVER_OWNED_FIELDS: ReadonlySet<string> = new Set([
  ...Object.keys(RESERVED_UPDATED_MESSAGE_FIELDS),
  ...Object.keys(LOCAL_MESSAGE_FIELDS),
  ...SCHEDULED_MESSAGE_SERVER_FIELDS,
]);

const COMPOSER_OWNED_FIELDS: ReadonlySet<string> = new Set([
  'attachments',
  'mentioned_channel',
  'mentioned_group_ids',
  'mentioned_here',
  'mentioned_roles',
  'mentioned_users',
  'parent_id',
  'poll_id',
  'quoted_message_id',
  'show_in_channel',
  'text',
]);

const STORED_FIELDS_REPLACED_ON_UPDATE: ReadonlySet<string> = new Set([
  ...SERVER_OWNED_FIELDS,
  ...COMPOSER_OWNED_FIELDS,
]);

const COMPOSED_FIELDS_DROPPED_ON_UPDATE: ReadonlySet<string> = new Set(
  [...SERVER_OWNED_FIELDS].filter((field) => !COMPOSER_OWNED_FIELDS.has(field)),
);

const omitFields = <T extends object>(source: T, fields: ReadonlySet<string>): Message =>
  Object.fromEntries(Object.entries(source).filter(([field]) => !fields.has(field)));

export const toScheduledMessageDraft = (
  scheduledMessage: ScheduledMessageResponse,
): DraftMessage => {
  const { id, message } = scheduledMessage;
  const {
    attachments,
    mentioned_channel,
    mentioned_group_ids,
    mentioned_here,
    mentioned_roles,
    mentioned_users,
    parent_id,
    poll_id,
    quoted_message_id,
    show_in_channel,
    text,
  } = message;

  const draftMessage = {
    attachments,
    id,
    mentioned_channel,
    mentioned_group_ids,
    mentioned_here,
    mentioned_roles,
    mentioned_users,
    parent_id,
    poll_id,
    quoted_message_id,
    show_in_channel,
    text,
  };

  return draftMessage;
};

export const toScheduledMessageComposition = (
  scheduledMessage: ScheduledMessageResponse,
): DraftResponse => {
  const { cid, created_at, message } = scheduledMessage;
  const { parent_id } = message;

  const composition = {
    channel_cid: cid,
    created_at,
    message: toScheduledMessageDraft(scheduledMessage),
    parent_id,
  };

  return composition;
};

export const toScheduledMessagePayload = (
  composedMessage: Message | UpdatedMessage,
  scheduledMessage: ScheduledMessageResponse,
): Message => {
  const { message: storedMessage } = scheduledMessage;
  const { parent_id: parentId } = storedMessage;

  const preservedFields = omitFields(storedMessage, STORED_FIELDS_REPLACED_ON_UPDATE);
  const composedFields = omitFields(composedMessage, COMPOSED_FIELDS_DROPPED_ON_UPDATE);

  const scheduledMessagePayload = {
    ...preservedFields,
    ...composedFields,
    parent_id: parentId,
  };

  return scheduledMessagePayload;
};
