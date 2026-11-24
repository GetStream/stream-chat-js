import { LOCAL_MESSAGE_FIELDS, RESERVED_UPDATED_MESSAGE_FIELDS } from '../constants';
import { formatMessage, omitFields, pickFields } from '../utils';
import { nsToDate } from '../utils/time';
import type {
  MessageRequest,
  ScheduledMessageContentResponse,
  ScheduledMessageResponse,
  SharedLocationResponseData,
} from '../gen/models';
import type { DraftMessage, LocalMessage, UserResponse } from '../types';

const SCHEDULED_MESSAGE_SERVER_FIELDS = ['id', 'mml'];

const SERVER_OWNED_FIELDS: ReadonlySet<string> = new Set([
  ...Object.keys(RESERVED_UPDATED_MESSAGE_FIELDS),
  ...Object.keys(LOCAL_MESSAGE_FIELDS),
  ...SCHEDULED_MESSAGE_SERVER_FIELDS,
]);

const COMPOSER_CONTENT_FIELD_NAMES = [
  'attachments',
  'custom',
  'mentioned_channel',
  'mentioned_group_ids',
  'mentioned_here',
  'mentioned_roles',
  'parent_id',
  'poll_id',
  'quoted_message_id',
  'show_in_channel',
  'text',
] as const satisfies ReadonlyArray<keyof ScheduledMessageContentResponse>;

const COMPOSER_OWNED_FIELD_NAMES = [
  ...COMPOSER_CONTENT_FIELD_NAMES,
  'mentioned_users',
  'shared_location',
] as const satisfies ReadonlyArray<keyof ScheduledMessageContentResponse>;

const COMPOSER_OWNED_FIELDS: ReadonlySet<string> = new Set(COMPOSER_OWNED_FIELD_NAMES);

const STORED_FIELDS_REPLACED_ON_UPDATE: ReadonlySet<string> = new Set([
  ...SERVER_OWNED_FIELDS,
  ...COMPOSER_OWNED_FIELDS,
]);

const COMPOSED_FIELDS_DROPPED_ON_UPDATE: ReadonlySet<string> = new Set(
  [...SERVER_OWNED_FIELDS].filter((field) => !COMPOSER_OWNED_FIELDS.has(field)),
);

/**
 * The scheduled message's location in the shape the location composer reads, keyed to the
 * scheduled message. A location without coordinates is not one the composer can send, so it is left out.
 */
const toComposerLocation = ({
  cid,
  created_at,
  id,
  message,
  updated_at,
  user,
}: ScheduledMessageResponse): SharedLocationResponseData | undefined => {
  const location = message.shared_location;
  if (!location) return undefined;

  const { created_by_device_id, end_at, latitude, longitude } = location;
  if (latitude === undefined || longitude === undefined) return undefined;

  return {
    channel_cid: cid,
    created_at,
    created_by_device_id,
    ...(end_at === undefined ? {} : { end_at }),
    latitude,
    longitude,
    message_id: id,
    updated_at,
    user_id: user.id,
  };
};

export const toComposerContent = (
  scheduledMessage: ScheduledMessageResponse,
): DraftMessage => {
  const { id, message } = scheduledMessage;
  const sharedLocation = toComposerLocation(scheduledMessage);

  const content: DraftMessage = {
    ...pickFields(message, COMPOSER_CONTENT_FIELD_NAMES),
    ...(sharedLocation ? { shared_location: sharedLocation } : {}),
    id,
  };

  return content;
};

export const toScheduledMessagePayload = (
  composedMessage: MessageRequest,
  scheduledMessage: ScheduledMessageResponse,
): MessageRequest => {
  const { message: storedMessage } = scheduledMessage;
  const { parent_id: parentId, pin_expires: pinExpires } = storedMessage;

  const preservedFields = omitFields(storedMessage, STORED_FIELDS_REPLACED_ON_UPDATE);
  const composedFields = omitFields(composedMessage, COMPOSED_FIELDS_DROPPED_ON_UPDATE);

  const scheduledMessagePayload: MessageRequest = {
    ...preservedFields,
    ...(pinExpires === undefined ? {} : { pin_expires: nsToDate(pinExpires) }),
    ...composedFields,
    parent_id: parentId,
  };

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
    mentioned_users: mentionedUserIds = [],
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
    mentioned_users: mentionedUserIds.map((id) => ({ id }) as UserResponse),
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
