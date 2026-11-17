import { LOCAL_MESSAGE_FIELDS, RESERVED_UPDATED_MESSAGE_FIELDS } from '../constants';
import { formatMessage, omitFields, pickFields } from '../utils';
import { nsToDate } from '../utils/time';
import type {
  MessageRequest,
  ScheduledMessageContentResponse,
  ScheduledMessageResponse,
} from '../gen/models';
import type { DraftMessage, DraftResponse, LocalMessage } from '../types';

const SCHEDULED_MESSAGE_SERVER_FIELDS = ['id', 'mml', 'shared_location'];

const SERVER_OWNED_FIELDS: ReadonlySet<string> = new Set([
  ...Object.keys(RESERVED_UPDATED_MESSAGE_FIELDS),
  ...Object.keys(LOCAL_MESSAGE_FIELDS),
  ...SCHEDULED_MESSAGE_SERVER_FIELDS,
]);

const COMPOSER_OWNED_FIELD_NAMES = [
  'attachments',
  'custom',
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
] as const satisfies ReadonlyArray<keyof ScheduledMessageContentResponse>;

const COMPOSER_OWNED_FIELDS: ReadonlySet<string> = new Set(COMPOSER_OWNED_FIELD_NAMES);

const STORED_FIELDS_REPLACED_ON_UPDATE: ReadonlySet<string> = new Set([
  ...SERVER_OWNED_FIELDS,
  ...COMPOSER_OWNED_FIELDS,
]);

const COMPOSED_FIELDS_DROPPED_ON_UPDATE: ReadonlySet<string> = new Set(
  [...SERVER_OWNED_FIELDS].filter((field) => !COMPOSER_OWNED_FIELDS.has(field)),
);

export const toScheduledMessageDraft = (
  scheduledMessage: ScheduledMessageResponse,
): DraftMessage => {
  const { id, message } = scheduledMessage;

  return {
    ...pickFields(message, COMPOSER_OWNED_FIELD_NAMES),
    custom: message.custom ?? {},
    id,
    text: message.text,
  } as DraftMessage;
};

export const toScheduledMessageComposition = (
  scheduledMessage: ScheduledMessageResponse,
): DraftResponse => {
  const { cid, created_at, message } = scheduledMessage;
  const { parent_id } = message;

  return {
    channel_cid: cid,
    created_at,
    message: toScheduledMessageDraft(scheduledMessage),
    parent_id,
  } as DraftResponse;
};

export const toScheduledMessagePayload = (
  composedMessage: MessageRequest,
  scheduledMessage: ScheduledMessageResponse,
): MessageRequest => {
  const { message: storedMessage } = scheduledMessage;
  const { parent_id: parentId, pin_expires: pinExpires } = storedMessage;

  const preservedFields = omitFields(storedMessage, STORED_FIELDS_REPLACED_ON_UPDATE);
  const composedFields = omitFields(composedMessage, COMPOSED_FIELDS_DROPPED_ON_UPDATE);

  const scheduledMessagePayload = {
    ...preservedFields,
    ...(pinExpires === undefined ? {} : { pin_expires: nsToDate(pinExpires) }),
    ...composedFields,
    parent_id: parentId,
  } as MessageRequest;

  return scheduledMessagePayload;
};

export const toScheduledMessagePreview = (
  scheduledMessage: ScheduledMessageResponse,
): LocalMessage => {
  const { cid, created_at, id, message, scheduled_at, user } = scheduledMessage;
  const {
    attachments = [],
    custom = {},
    mentioned_channel = false,
    mentioned_here = false,
    parent_id,
    poll_id,
    quoted_message_id,
    show_in_channel,
    silent = false,
    text,
  } = message;

  return formatMessage({
    attachments,
    cid,
    created_at,
    custom,
    deleted_reply_count: 0,
    html: '',
    id,
    latest_reactions: [],
    mentioned_channel,
    mentioned_here,
    mentioned_users: [],
    own_reactions: [],
    parent_id,
    pinned: false,
    poll_id,
    quoted_message_id,
    reaction_counts: {},
    reaction_scores: {},
    reply_count: 0,
    restricted_visibility: [],
    shadowed: false,
    show_in_channel,
    silent,
    text,
    type: 'regular',
    updated_at: scheduled_at,
    user,
  });
};
