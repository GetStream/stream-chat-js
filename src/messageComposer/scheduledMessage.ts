import type {
  DraftMessage,
  Message,
  ScheduledMessageResponse,
  UpdatedMessage,
} from '../types';

const SERVER_FIELDS: ReadonlySet<string> = new Set([
  'html',
  'id',
  'mml',
  'shared_location',
  'type',
]);

const COMPOSER_FIELDS: ReadonlySet<string> = new Set([
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

const REPLACED_FIELDS: ReadonlySet<string> = new Set([
  ...SERVER_FIELDS,
  ...COMPOSER_FIELDS,
]);

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

export const toScheduledMessagePayload = (
  composedMessage: Message | UpdatedMessage,
  scheduledMessage: ScheduledMessageResponse,
): Message => {
  const { message: storedMessage } = scheduledMessage;
  const { parent_id: parentId } = storedMessage;

  const preservedFields = omitFields(storedMessage, REPLACED_FIELDS);
  const composedFields = omitFields(composedMessage, SERVER_FIELDS);

  const scheduledMessagePayload = {
    ...preservedFields,
    ...composedFields,
    parent_id: parentId,
  };

  return scheduledMessagePayload;
};
