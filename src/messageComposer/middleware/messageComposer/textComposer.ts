import type { MiddlewareHandlerParams } from '../../../middleware';
import type { DraftMessage, LocalMessage, UserResponse } from '../../../types';
import type { MessageComposer } from '../../messageComposer';
import { mentionEntityToUserResponse } from '../textComposer/mentionUtils';
import type { MentionEntity } from '../textComposer/types';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
} from './types';

type MentionPayloadBase = Pick<
  LocalMessage,
  'mentioned_channel' | 'mentioned_group_ids' | 'mentioned_here' | 'mentioned_roles'
>;

type MentionCompositionMetadata = Omit<
  Required<MentionPayloadBase>,
  'mentioned_channel' | 'mentioned_here'
> & {
  mentioned_channel: boolean;
  mentioned_here: boolean;
  mentioned_users: UserResponse[];
};

type BuildMentionCompositionMetadataParams = {
  mentions: MentionEntity[];
  text: string;
};

type DraftMentionPayload = Pick<
  DraftMessage,
  | 'mentioned_channel'
  | 'mentioned_group_ids'
  | 'mentioned_here'
  | 'mentioned_roles'
  | 'mentioned_users'
>;

const textIncludesMentionToken = (text: string, token: string) =>
  text.includes(`@${token}`);
const isDefined = <TValue>(value: TValue | undefined): value is TValue =>
  value !== undefined;

const getMentionEntityTextCandidates = (entity: MentionEntity) => {
  if (entity.mentionType === 'channel') return ['channel'];
  if (entity.mentionType === 'here') return ['here'];
  if (entity.mentionType === 'user') return [entity.id, entity.name].filter(isDefined);
  if (entity.mentionType === 'role') return [entity.name, entity.id].filter(isDefined);
  if (entity.mentionType === 'user_group') {
    return entity.name ? [entity.name, entity.id].filter(isDefined) : [];
  }

  return [];
};

const isMentionEntityPresentInText = (entity: MentionEntity, text: string) => {
  const textCandidates = getMentionEntityTextCandidates(entity);
  if (!textCandidates.length) return true;

  return textCandidates.some((candidate) => textIncludesMentionToken(text, candidate));
};

const dedupeBy = <TItem, TKey extends string>(
  items: TItem[],
  getKey: (item: TItem) => TKey,
) => {
  const uniqueItems = new Map<TKey, TItem>();

  items.forEach((item) => {
    uniqueItems.set(getKey(item), item);
  });

  return [...uniqueItems.values()];
};

const buildMentionCompositionMetadata = ({
  mentions,
  text,
}: BuildMentionCompositionMetadataParams): MentionCompositionMetadata => {
  const presentMentions = dedupeBy(
    mentions.filter((entity) => isMentionEntityPresentInText(entity, text)),
    (entity) => `${entity.mentionType}:${entity.id}`,
  );

  return presentMentions.reduce<MentionCompositionMetadata>(
    (acc, entity) => {
      if (entity.mentionType === 'user') {
        acc.mentioned_users.push(mentionEntityToUserResponse(entity));
      } else if (entity.mentionType === 'channel') {
        acc.mentioned_channel = true;
      } else if (entity.mentionType === 'here') {
        acc.mentioned_here = true;
      } else if (entity.mentionType === 'role') {
        acc.mentioned_roles.push(entity.id);
      } else if (entity.mentionType === 'user_group') {
        acc.mentioned_group_ids.push(entity.id);
      }

      return acc;
    },
    {
      mentioned_channel: false,
      mentioned_group_ids: [],
      mentioned_here: false,
      mentioned_roles: [],
      mentioned_users: [],
    },
  );
};

export const createTextComposerCompositionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/text-composition',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      if (!composer.textComposer) return forward();
      const { mentions, text } = composer.textComposer;
      const {
        mentioned_channel,
        mentioned_group_ids,
        mentioned_here,
        mentioned_roles,
        mentioned_users,
      } = buildMentionCompositionMetadata({ mentions, text });

      // prevent introducing text and mention metadata into the payload sent to the server
      if (
        !text &&
        !mentioned_channel &&
        !mentioned_here &&
        mentioned_group_ids.length === 0 &&
        mentioned_roles.length === 0 &&
        mentioned_users.length === 0
      ) {
        return forward();
      }

      return next({
        ...state,
        localMessage: {
          ...state.localMessage,
          mentioned_channel,
          mentioned_group_ids,
          mentioned_here,
          mentioned_roles,
          mentioned_users,
          text,
        },
        message: {
          ...state.message,
          mentioned_channel,
          mentioned_group_ids,
          mentioned_here,
          mentioned_roles,
          mentioned_users: mentioned_users.map((u) => u.id),
          text,
        },
      });
    },
  },
});

export const createDraftTextComposerCompositionMiddleware = (
  composer: MessageComposer,
): MessageDraftCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/draft-text-composition',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
      if (!composer.textComposer) return forward();
      const { maxLengthOnSend } = composer.config.text ?? {};
      const { mentions, text: inputText } = composer.textComposer;

      const text =
        typeof maxLengthOnSend === 'number' && inputText.length > maxLengthOnSend
          ? inputText.slice(0, maxLengthOnSend)
          : inputText;
      const {
        mentioned_channel,
        mentioned_group_ids,
        mentioned_here,
        mentioned_roles,
        mentioned_users,
      } = buildMentionCompositionMetadata({ mentions, text });
      const draftMentionPayload: DraftMentionPayload = {
        ...(mentioned_channel ? { mentioned_channel: true } : {}),
        ...(mentioned_group_ids.length ? { mentioned_group_ids } : {}),
        ...(mentioned_here ? { mentioned_here: true } : {}),
        ...(mentioned_roles.length ? { mentioned_roles } : {}),
        ...(mentioned_users.length
          ? { mentioned_users: mentioned_users.map((u) => u.id) }
          : {}),
      };

      return next({
        ...state,
        draft: {
          ...state.draft,
          ...draftMentionPayload,
          text,
        },
      });
    },
  },
});
