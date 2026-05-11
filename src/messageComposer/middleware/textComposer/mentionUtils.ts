import type { UserResponse } from '../../../types';
import type { MentionEntity, UserMentionEntity, UserSuggestion } from './types';

export const isUserMentionEntity = (entity: MentionEntity): entity is UserMentionEntity =>
  entity.mentionType === 'user';

export const userResponseToMentionEntity = (user: UserResponse): UserMentionEntity => ({
  ...user,
  mentionType: 'user',
});

export const userResponsesToMentionEntities = (users: UserResponse[]) =>
  users.map(userResponseToMentionEntity);

export const mentionEntityToUserResponse = (entity: UserMentionEntity): UserResponse => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { mentionType, ...user } = entity;
  return user;
};

export const userSuggestionToUserResponse = (
  suggestion: UserSuggestion,
): UserResponse => {
  const { mentionType, tokenizedDisplayName, ...userResponse } = suggestion;
  void mentionType;
  void tokenizedDisplayName;
  return userResponse;
};

export const userSuggestionToMentionEntity = (
  suggestion: UserSuggestion,
): UserMentionEntity =>
  userResponseToMentionEntity(userSuggestionToUserResponse(suggestion));
