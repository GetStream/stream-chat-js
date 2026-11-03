import { LOCAL_MESSAGE_FIELDS, RESERVED_UPDATED_MESSAGE_FIELDS } from '../constants';
import { chatLoggerSystem } from '../logger';
import { formatMessage } from '../utils';
import { nsToDate } from '../utils/time';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';
import type {
  MessageRequest,
  ScheduledMessageContentResponse,
  ScheduledMessageResponse,
} from '../gen/models';
import type { DraftMessage, DraftResponse, LocalMessage, UserResponse } from '../types';

const logger = chatLoggerSystem.getLogger('message-composer');

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

const omitFields = <T extends object>(source: T, fields: ReadonlySet<string>) =>
  Object.fromEntries(Object.entries(source).filter(([field]) => !fields.has(field)));

const pickFields = <T extends object, K extends keyof T>(
  source: T,
  fields: readonly K[],
): Pick<T, K> =>
  Object.fromEntries(
    fields.filter((field) => field in source).map((field) => [field, source[field]]),
  ) as Pick<T, K>;

export const toScheduledMessageDraft = (
  scheduledMessage: ScheduledMessageResponse,
): DraftMessage => {
  const { id, message } = scheduledMessage;

  const draftMessage = {
    ...pickFields(message, COMPOSER_OWNED_FIELD_NAMES),
    custom: message.custom ?? {},
    id,
    text: message.text,
  } as DraftMessage;

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
  } as DraftResponse;

  return composition;
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

  const previewMessage = formatMessage({
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

  return previewMessage;
};

export const resolveMentionedUsers = async (
  client: StreamChat,
  userIds: string[] = [],
): Promise<UserResponse[]> => {
  const knownUsers = client.state.users;
  const missingUserIds = userIds.filter((userId) => !knownUsers[userId]);

  const fetchedUsers: Record<string, UserResponse> = {};

  if (missingUserIds.length) {
    try {
      const { users } = await client.queryUsers({
        payload: { filter_conditions: { id: { $in: missingUserIds } } },
      });
      users.forEach((user) => (fetchedUsers[user.id] = user));
    } catch (error) {
      logger
        .withExtraTags('resolveMentionedUsers')
        .error('Resolving the mentioned users failed.', { error });
    }
  }

  const mentionedUsers = userIds.map(
    (userId): UserResponse =>
      knownUsers[userId] ?? fetchedUsers[userId] ?? ({ id: userId } as UserResponse),
  );

  return mentionedUsers;
};

export const resolveQuotedMessage = async (
  channel: Channel,
  quotedMessageId?: string,
): Promise<LocalMessage | null> => {
  if (!quotedMessageId) return null;

  const client = channel.getClient();
  const storedMessage = client.messageStore.get(quotedMessageId);

  if (storedMessage) return storedMessage;

  try {
    const { message } = await client.getMessage({ id: quotedMessageId });

    const quotedMessage = formatMessage(message);

    return quotedMessage;
  } catch (error) {
    logger
      .withExtraTags('resolveQuotedMessage')
      .error('Resolving the quoted message failed.', { error });

    return null;
  }
};
