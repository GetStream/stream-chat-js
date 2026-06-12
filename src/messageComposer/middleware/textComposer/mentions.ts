import {
  getTokenizedSuggestionDisplayName,
  getTriggerCharWithToken,
  insertItemWithTrigger,
} from './textMiddlewareUtils';
import { getMentionedUsersInText } from './commandUtils';
import {
  userResponsesToMentionEntities,
  userSuggestionToMentionEntity,
  userSuggestionToUserResponse,
} from './mentionUtils';
import { BaseSearchSource, type SearchSourceOptions } from '../../../search';
import { mergeWith } from '../../../utils/mergeWith';
import type {
  ChannelMentionSuggestion,
  HereMentionSuggestion,
  MentionEntity,
  MentionSuggestion,
  RoleMentionSuggestion,
  TextComposerMiddlewareOptions,
  UserGroupMentionSuggestion,
  UserSuggestion,
} from './types';
import type { StreamChat } from '../../../client';
import type {
  MemberFilters,
  MemberSort,
  SearchUserGroupsOptions,
  UserFilters,
  UserGroupResponse,
  UserOptions,
  UserResponse,
  UserSort,
} from '../../../types';
import type { Channel } from '../../../channel';
import { MAX_CHANNEL_MEMBER_COUNT_IN_CHANNEL_QUERY } from '../../../constants';
import type { Middleware } from '../../../middleware';
import type { TextComposerMiddlewareExecutorState } from './TextComposerMiddlewareExecutor';

// todo: the map is too small - Slavic letters with diacritics are missing for example
export const accentsMap: { [key: string]: string } = {
  a: 'á|à|ã|â|À|Á|Ã|Â',
  c: 'ç|Ç',
  e: 'é|è|ê|É|È|Ê',
  i: 'í|ì|î|Í|Ì|Î',
  n: 'ñ|Ñ',
  o: 'ó|ò|ô|ő|õ|Ó|Ò|Ô|Õ',
  u: 'ú|ù|û|ü|Ú|Ù|Û|Ü',
};

export const removeDiacritics = (text?: string) => {
  if (!text) return '';
  return Object.keys(accentsMap).reduce(
    (acc, current) => acc.replace(new RegExp(accentsMap[current], 'g'), current),
    text,
  );
};

export const calculateLevenshtein = (query: string, name: string) => {
  if (query.length === 0) return name.length;
  if (name.length === 0) return query.length;

  const matrix = [];

  let i;
  for (i = 0; i <= name.length; i++) {
    matrix[i] = [i];
  }

  let j;
  for (j = 0; j <= query.length; j++) {
    matrix[0][j] = j;
  }

  for (i = 1; i <= name.length; i++) {
    for (j = 1; j <= query.length; j++) {
      if (name.charAt(i - 1) === query.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1,
          ),
        ); // deletion
      }
    }
  }

  return matrix[name.length][query.length];
};

export type MentionsSearchSourceOptions = SearchSourceOptions & {
  mentionAllAppUsers?: boolean;
  suggestionFactoryMappers?: MentionSuggestionFactoryMapperOverrides;
  textComposerText?: string;
  trigger?: string;
  // todo: document that if you want transliteration, you need to provide the function, e.g. import {default: transliterate}  from '@sindresorhus/transliterate';
  // this is now replacing a parameter useMentionsTransliteration
  transliterate?: (text: string) => string;
};

type MentionType = MentionSuggestion['mentionType'];
type MentionSuggestionFactoryInputByType = {
  channel: 'channel';
  here: 'here';
  role: string;
  user: UserResponse;
  user_group: UserGroupResponse;
};
type MentionSuggestionByType = {
  channel: ChannelMentionSuggestion;
  here: HereMentionSuggestion;
  role: RoleMentionSuggestion;
  user: UserSuggestion;
  user_group: UserGroupMentionSuggestion;
};

export type MentionSuggestionFactoryMapperContext = {
  searchToken: string;
  source: MentionsSearchSource;
};

export type MentionSuggestionFactoryMapper<
  TMentionType extends MentionType = MentionType,
> = (
  value: MentionSuggestionFactoryInputByType[TMentionType],
  context: MentionSuggestionFactoryMapperContext,
) => MentionSuggestionByType[TMentionType];

export type MentionSuggestionFactoryMapperOverrides = {
  [TMentionType in MentionType]?: MentionSuggestionFactoryMapper<TMentionType>;
};

const hasOwnCapability = (ownCapabilities: string[] | undefined, capability: string) =>
  ownCapabilities?.includes(capability) ?? false;

export const getAllowedMentionTypesFromCapabilities = (
  ownCapabilities?: string[],
): Record<MentionType, boolean> => ({
  channel: hasOwnCapability(ownCapabilities, 'notify-channel'),
  here: hasOwnCapability(ownCapabilities, 'notify-here'),
  role: hasOwnCapability(ownCapabilities, 'notify-role'),
  user: true,
  user_group: hasOwnCapability(ownCapabilities, 'notify-group'),
});

type UserGroupSearchCursor = Pick<SearchUserGroupsOptions, 'id_gt' | 'name_gt'>;
type UserPaginationState = {
  itemCount: number;
  nextOffset?: number;
};

const decodeUserGroupCursor = <TCursor extends object>(cursor?: string | null) => {
  if (!cursor) return undefined;

  try {
    return JSON.parse(cursor) as TCursor;
  } catch {
    return undefined;
  }
};

const upsertUserResponse = (users: UserResponse[], user: UserResponse) => {
  const existingIndex = users.findIndex((currentUser) => currentUser.id === user.id);
  if (existingIndex === -1) return users.concat(user);

  const nextUsers = [...users];
  nextUsers.splice(existingIndex, 1, user);
  return nextUsers;
};

const upsertMentionEntity = (mentions: MentionEntity[], entity: MentionEntity) => {
  const existingIndex = mentions.findIndex(
    (currentEntity) =>
      currentEntity.id === entity.id && currentEntity.mentionType === entity.mentionType,
  );
  if (existingIndex === -1) return mentions.concat(entity);

  const nextMentions = [...mentions];
  nextMentions.splice(existingIndex, 1, entity);
  return nextMentions;
};

const mentionSuggestionToEntity = (suggestion: MentionSuggestion): MentionEntity => {
  if (suggestion.mentionType === 'user') {
    return userSuggestionToMentionEntity(suggestion);
  } else if (suggestion.mentionType === 'channel') {
    return {
      id: 'channel',
      mentionType: 'channel',
      name: 'channel',
    };
  } else if (suggestion.mentionType === 'here') {
    return {
      id: 'here',
      mentionType: 'here',
      name: 'here',
    };
  } else if (suggestion.mentionType === 'role') {
    return {
      id: suggestion.id,
      mentionType: 'role',
      name: suggestion.name,
    };
  } else if (suggestion.mentionType === 'user_group') {
    return {
      id: suggestion.id,
      mentionType: 'user_group',
      name: suggestion.name,
    };
  }

  throw new Error(`Unsupported mention suggestion type: ${JSON.stringify(suggestion)}`);
};

const mentionSuggestionToInsertText = (suggestion: MentionSuggestion) =>
  `@${suggestion.name || suggestion.id} `;

const DEFAULT_SUGGESTION_FACTORY_MAPPERS: {
  [TMentionType in MentionType]: MentionSuggestionFactoryMapper<TMentionType>;
} = {
  channel: (value, { searchToken }) => {
    const name = String(value);
    return {
      id: name,
      mentionType: 'channel',
      name: 'channel',
      ...getTokenizedSuggestionDisplayName({
        displayName: name,
        searchToken,
      }),
    } satisfies ChannelMentionSuggestion;
  },
  here: (value, { searchToken }) => {
    const name = String(value);
    return {
      id: name,
      mentionType: 'here',
      name: 'here',
      ...getTokenizedSuggestionDisplayName({
        displayName: name,
        searchToken,
      }),
    } satisfies HereMentionSuggestion;
  },
  role: (value, { searchToken }) => {
    const role = String(value);
    return {
      id: role,
      mentionType: 'role',
      name: role,
      ...getTokenizedSuggestionDisplayName({
        displayName: role,
        searchToken,
      }),
    } satisfies RoleMentionSuggestion;
  },
  user: (value, { searchToken }) => {
    const user = value as UserResponse;
    return {
      ...user,
      mentionType: 'user',
      ...getTokenizedSuggestionDisplayName({
        displayName: user.name || user.id,
        searchToken,
      }),
    } satisfies UserSuggestion;
  },
  user_group: (value, { searchToken }) => {
    const userGroup = value as UserGroupResponse;
    return {
      description: userGroup.description,
      id: userGroup.id,
      /*
      Currently, all members of the group are always returned. Groups are limited to 100 members.
      The memberCount == len(members) will always be true unless we add pagination here in the future
       */
      memberCount: userGroup.members?.length,
      mentionType: 'user_group',
      name: userGroup.name,
      ...getTokenizedSuggestionDisplayName({
        displayName: userGroup.name || userGroup.id,
        searchToken,
      }),
    } satisfies UserGroupMentionSuggestion;
  },
};

export class MentionsSearchSource extends BaseSearchSource<MentionSuggestion> {
  readonly type = 'mentions';
  protected client: StreamChat;
  protected channel: Channel;
  protected latestUserPaginationState?: UserPaginationState;
  protected userGroupCursor?: string;
  userFilters: UserFilters | undefined;
  memberFilters: MemberFilters | undefined;
  userSort: UserSort | undefined;
  memberSort: MemberSort | undefined; // todo: document there are filters and sort options for users and members
  searchOptions: Omit<UserOptions, 'limit' | 'offset'> | undefined;
  config: MentionsSearchSourceOptions;

  constructor(channel: Channel, options?: MentionsSearchSourceOptions) {
    const {
      mentionAllAppUsers,
      suggestionFactoryMappers,
      textComposerText,
      transliterate,
      trigger,
      ...restOptions
    } = options || {};
    super(restOptions);
    this.client = channel.getClient();
    this.channel = channel;
    this.config = {
      mentionAllAppUsers,
      suggestionFactoryMappers,
      textComposerText,
      trigger,
    };

    if (transliterate) {
      this.transliterate = transliterate;
    }
  }

  get allMembersLoadedWithInitialChannelQuery() {
    const countLoadedMembers = Object.keys(this.channel.state.members || {}).length;
    return countLoadedMembers < MAX_CHANNEL_MEMBER_COUNT_IN_CHANNEL_QUERY;
  }

  normalizeSearchValue = (value?: string) =>
    this.transliterate(removeDiacritics(value)).toLowerCase();

  matchesSearchQuery = (value: string | undefined, searchQuery: string) => {
    if (!searchQuery) return true;
    return this.normalizeSearchValue(value).includes(
      this.normalizeSearchValue(searchQuery),
    );
  };

  matchesPrefixSearchQuery = (value: string | undefined, searchQuery: string) => {
    if (!searchQuery) return true;

    return this.normalizeSearchValue(value).startsWith(
      this.normalizeSearchValue(searchQuery),
    );
  };

  matchesUserNameSearchQuery = (value: string | undefined, searchQuery: string) => {
    if (!searchQuery) return true;

    const normalizedValueWords = this.normalizeSearchValue(value)
      .split(/\s+/)
      .filter(Boolean);
    const normalizedQueryWords = this.normalizeSearchValue(searchQuery)
      .split(/\s+/)
      .filter(Boolean);

    if (!normalizedValueWords.length || !normalizedQueryWords.length) return false;

    const fullMatchWords = normalizedQueryWords.slice(0, -1);
    const finalQueryWord = normalizedQueryWords[normalizedQueryWords.length - 1];

    return (
      fullMatchWords.every((queryWord) => normalizedValueWords.includes(queryWord)) &&
      normalizedValueWords.some((valueWord) => valueWord.startsWith(finalQueryWord))
    );
  };

  isMentionTypeAllowed = (mentionType: MentionType) =>
    getAllowedMentionTypesFromCapabilities(this.channel.data?.own_capabilities)[
      mentionType
    ];

  protected mapMentionSuggestion = <TMentionType extends MentionType>(
    mentionType: TMentionType,
    value: MentionSuggestionFactoryInputByType[TMentionType],
    searchToken = this.searchQuery,
  ) => {
    const mapper =
      this.config.suggestionFactoryMappers?.[mentionType] ??
      DEFAULT_SUGGESTION_FACTORY_MAPPERS[mentionType];

    return mapper(value, {
      searchToken,
      source: this,
    }) as MentionSuggestionByType[TMentionType];
  };

  getChannelTeam = () => this.channel.data?.team;

  toUserSuggestion = (
    user: UserResponse,
    searchToken = this.searchQuery,
  ): UserSuggestion => this.mapMentionSuggestion('user', user, searchToken);

  toChannelMentionSuggestion = (
    searchToken = this.searchQuery,
  ): ChannelMentionSuggestion =>
    this.mapMentionSuggestion('channel', 'channel', searchToken);

  toHereMentionSuggestion = (searchToken = this.searchQuery): HereMentionSuggestion =>
    this.mapMentionSuggestion('here', 'here', searchToken);

  toRoleMentionSuggestion = (
    role: string,
    searchToken = this.searchQuery,
  ): RoleMentionSuggestion => this.mapMentionSuggestion('role', role, searchToken);

  toUserGroupMentionSuggestion = (
    userGroup: UserGroupResponse,
    searchToken = this.searchQuery,
  ): UserGroupMentionSuggestion =>
    this.mapMentionSuggestion('user_group', userGroup, searchToken);

  getStateBeforeFirstQuery(newSearchString: string) {
    this.userGroupCursor = undefined;
    const newState = super.getStateBeforeFirstQuery(newSearchString);
    const { items } = this.state.getLatestValue();
    return {
      ...newState,
      items, // preserve items to avoid flickering
    };
  }

  canExecuteQuery = (newSearchString?: string) => {
    const hasNewSearchQuery = typeof newSearchString !== 'undefined';
    return this.isActive && !this.isLoading && (hasNewSearchQuery || this.hasNext);
  };

  protected updatePaginationStateFromQuery() {
    const userPaginationState = this.latestUserPaginationState ?? { itemCount: 0 };

    return {
      hasNext:
        typeof userPaginationState.nextOffset !== 'undefined' ||
        typeof this.userGroupCursor !== 'undefined',
      next: undefined,
      offset: (this.offset ?? 0) + userPaginationState.itemCount,
    };
  }

  transliterate = (text: string) => text;

  getMembersAndWatchers = () => {
    const memberUsers = Object.values(this.channel.state.members ?? {}).map(
      ({ user }) => user,
    );
    const watcherUsers = Object.values(this.channel.state.watchers ?? {});
    const users = [...memberUsers, ...watcherUsers];

    const uniqueUsers = {} as Record<string, UserResponse>;

    users.forEach((user) => {
      if (user && !uniqueUsers[user.id]) {
        uniqueUsers[user.id] = user;
      }
    });

    return Object.values(uniqueUsers);
  };

  getBuiltinMentionSuggestions = (searchQuery: string): MentionSuggestion[] =>
    [
      ...(this.isMentionTypeAllowed('channel')
        ? [this.toChannelMentionSuggestion(searchQuery)]
        : []),
      ...(this.isMentionTypeAllowed('here')
        ? [this.toHereMentionSuggestion(searchQuery)]
        : []),
    ].filter(({ name }) => this.matchesPrefixSearchQuery(name, searchQuery));

  getRoleMentionSuggestions = async (query: string): Promise<RoleMentionSuggestion[]> => {
    if (!this.isMentionTypeAllowed('role')) return [];
    if (!query) return [];
    const { roles } = await this.client.searchRoles({ query });
    return [...(roles?.map((role) => role.name) ?? [])]
      .sort((left, right) => left.localeCompare(right))
      .map((role) => this.toRoleMentionSuggestion(role, query));
  };

  searchMembersLocally = (searchQuery: string) => {
    const { textComposerText } = this.config;
    if (!textComposerText) return [];

    return this.getMembersAndWatchers()
      .filter((user) => {
        if (user.id === this.client.userID) return false;
        if (!searchQuery) return true;

        const updatedId = this.transliterate(removeDiacritics(user.id)).toLowerCase();
        const updatedQuery = this.transliterate(
          removeDiacritics(searchQuery),
        ).toLowerCase();

        const maxDistance = 3;
        const trigger = this.config.trigger ?? '@';
        const lastDigits = textComposerText.slice(-(maxDistance + 1)).includes(trigger);

        if (this.matchesUserNameSearchQuery(user.name, updatedQuery)) {
          return true;
        }

        const levenshtein = calculateLevenshtein(updatedQuery, updatedId);

        return (
          updatedId.includes(updatedQuery) || (levenshtein <= maxDistance && lastDigits)
        );
      })
      .sort((a, b) => {
        if (!this.memberSort) return (a.name || '').localeCompare(b.name || '');

        // Apply each sort criteria in order
        for (const [field, direction] of Object.entries(this.memberSort)) {
          const aValue = a[field as keyof UserResponse];
          const bValue = b[field as keyof UserResponse];

          if (aValue === bValue) continue;
          return direction === 1
            ? String(aValue || '').localeCompare(String(bValue || ''))
            : String(bValue || '').localeCompare(String(aValue || ''));
        }
        return 0;
      });
  };

  prepareQueryUsersParams = (searchQuery: string, offset = 0) => ({
    filters: {
      $or: [
        { id: { $autocomplete: searchQuery } },
        { name: { $autocomplete: searchQuery } },
      ],
      ...this.userFilters,
    } as UserFilters,
    sort: this.userSort ?? ([{ name: 1 }, { id: 1 }] as UserSort), // todo: document the change - the sort is overridden, not merged
    options: { ...this.searchOptions, limit: this.pageSize, offset },
  });

  prepareQueryMembersParams = (searchQuery: string, offset = 0) => {
    // QueryMembers failed with error: \"sort must contain at maximum 1 item\"
    const maxSortParamsCount = 1;
    let sort: MemberSort = [{ user_id: 1 }];
    if (!this.memberSort) {
      sort = [{ user_id: 1 }];
    } else if (Array.isArray(this.memberSort)) {
      sort = this.memberSort[0];
    } else if (Object.keys(this.memberSort).length === maxSortParamsCount) {
      sort = this.memberSort;
    } // todo: document the change - the sort is overridden, not merged
    return {
      // todo: document the change - the filter is overridden, not merged
      filters:
        this.memberFilters ?? ({ name: { $autocomplete: searchQuery } } as MemberFilters), // autocomplete possible only for name
      sort,
      options: { ...this.searchOptions, limit: this.pageSize, offset },
    };
  };

  queryUsers = async (searchQuery: string, offset = 0) => {
    const { filters, sort, options } = this.prepareQueryUsersParams(searchQuery, offset);
    const { users } = await this.client.queryUsers(filters, sort, options);
    return users;
  };

  queryMembers = async (searchQuery: string, offset = 0) => {
    const { filters, sort, options } = this.prepareQueryMembersParams(
      searchQuery,
      offset,
    );
    const response = await this.channel.queryMembers(filters, sort, options);

    return response.members.map((member) => member.user) as UserResponse[];
  };

  getUserSuggestionsPage = async (searchQuery: string, userOffset = 0) => {
    if (!this.isMentionTypeAllowed('user')) {
      return {
        items: [],
        nextOffset: undefined,
      };
    }

    let users: UserResponse[];
    const shouldSearchLocally =
      this.allMembersLoadedWithInitialChannelQuery || !searchQuery;

    if (this.config.mentionAllAppUsers) {
      users = await this.queryUsers(searchQuery, userOffset);
    } else if (shouldSearchLocally) {
      const localUsers = this.searchMembersLocally(searchQuery);
      const items = localUsers
        .slice(userOffset, userOffset + this.pageSize)
        .map((user) => this.toUserSuggestion(user, searchQuery));
      return {
        items,
        nextOffset:
          localUsers.length > userOffset + this.pageSize
            ? userOffset + items.length
            : undefined,
      };
    } else {
      users = await this.queryMembers(searchQuery, userOffset);
    }

    const items = users.map((user) => this.toUserSuggestion(user, searchQuery));
    return {
      items,
      nextOffset: users.length === this.pageSize ? userOffset + users.length : undefined,
    };
  };

  buildUserGroupSearchCursor = (items: UserGroupResponse[]) => {
    if (items.length < this.pageSize) return undefined;

    const lastItem = items[items.length - 1];
    if (!lastItem?.name) return undefined;

    return JSON.stringify({
      id_gt: lastItem.id,
      name_gt: lastItem.name,
    } satisfies UserGroupSearchCursor);
  };

  getUserGroupSuggestionsPage = async (searchQuery: string, cursor?: string) => {
    if (!this.isMentionTypeAllowed('user_group')) {
      return {
        items: [],
        next: undefined,
      };
    }

    if (!searchQuery) {
      return {
        items: [],
        next: undefined,
      };
    }

    const teamId = this.getChannelTeam();
    const userGroupCursor = decodeUserGroupCursor<UserGroupSearchCursor>(cursor);
    const options: SearchUserGroupsOptions = {
      query: searchQuery,
      limit: this.pageSize,
      ...(teamId ? { team_id: teamId } : {}),
      ...(userGroupCursor?.id_gt ? { id_gt: userGroupCursor.id_gt } : {}),
      ...(userGroupCursor?.name_gt ? { name_gt: userGroupCursor.name_gt } : {}),
    };
    const { user_groups } = await this.client.searchUserGroups(options);

    return {
      items: user_groups.map((userGroup) =>
        this.toUserGroupMentionSuggestion(userGroup, searchQuery),
      ),
      next: this.buildUserGroupSearchCursor(user_groups),
    };
  };

  async query(searchQuery: string) {
    const userOffset = this.offset ?? 0;
    const isFirstPage = userOffset === 0 && typeof this.userGroupCursor === 'undefined';
    const previousUserPaginationState = this.latestUserPaginationState;
    const previousUserGroupCursor = this.userGroupCursor;
    const [userResultsState, userGroupResultsState, roleSuggestionsState] =
      await Promise.allSettled([
        this.getUserSuggestionsPage(searchQuery, userOffset),
        this.getUserGroupSuggestionsPage(searchQuery, previousUserGroupCursor),
        isFirstPage
          ? this.getRoleMentionSuggestions(searchQuery)
          : Promise.resolve([] as RoleMentionSuggestion[]),
      ]);

    const userResults =
      userResultsState.status === 'fulfilled'
        ? userResultsState.value
        : {
            items: [],
            nextOffset: isFirstPage ? undefined : previousUserPaginationState?.nextOffset,
          };
    const userGroupResults =
      userGroupResultsState.status === 'fulfilled'
        ? userGroupResultsState.value
        : {
            items: [],
            next: isFirstPage ? undefined : previousUserGroupCursor,
          };
    const roleSuggestions =
      roleSuggestionsState.status === 'fulfilled' ? roleSuggestionsState.value : [];
    const items = [
      ...(isFirstPage ? this.getBuiltinMentionSuggestions(searchQuery) : []),
      ...roleSuggestions,
      ...userGroupResults.items,
      ...userResults.items,
    ];

    this.latestUserPaginationState = {
      itemCount: userResults.items.length,
      nextOffset: userResults.nextOffset,
    };
    this.userGroupCursor = userGroupResults.next;

    return {
      items,
    };
  }

  filterMutes(data: UserSuggestion[]): UserSuggestion[];
  filterMutes(data: MentionSuggestion[]): MentionSuggestion[];
  filterMutes(data: MentionSuggestion[]) {
    const { textComposerText } = this.config;
    if (!textComposerText) return [];

    const { mutedUsers } = this.client;
    if (textComposerText.includes('/unmute') && !mutedUsers.length) {
      return [];
    }
    if (!mutedUsers.length) return data;

    if (textComposerText.includes('/unmute')) {
      return data.filter(
        (suggestion) =>
          suggestion.mentionType === 'user' &&
          mutedUsers.some((mute) => mute.target.id === suggestion.id),
      );
    }
    return data.filter(
      (suggestion) =>
        suggestion.mentionType !== 'user' ||
        mutedUsers.every((mute) => mute.target.id !== suggestion.id),
    );
  }

  filterQueryResults(items: MentionSuggestion[]) {
    return this.filterMutes(items);
  }

  resetState() {
    this.latestUserPaginationState = undefined;
    this.userGroupCursor = undefined;
    super.resetState();
  }
}

const DEFAULT_OPTIONS: TextComposerMiddlewareOptions = { minChars: 1, trigger: '@' };

/**
 * TextComposer middleware for mentions
 * Usage:
 *
 *  const textComposer = new TextComposer(options);
 *
 *  textComposer.use(createMentionsMiddleware(channel, {
 *   trigger: '$',
 *   minChars: 2
 *  }));
 *
 * @param channel
 * @param {{
 *     minChars: number;
 *     trigger: string;
 *   }} options
 * @returns
 */

export type MentionsMiddleware = Middleware<
  TextComposerMiddlewareExecutorState<MentionSuggestion>,
  'onChange' | 'onSuggestionItemSelect'
>;

export const createMentionsMiddleware = (
  channel: Channel,
  options?: Partial<TextComposerMiddlewareOptions> & {
    searchSource?: MentionsSearchSource;
  },
): MentionsMiddleware => {
  const finalOptions = mergeWith(DEFAULT_OPTIONS, options ?? {});
  let searchSource: MentionsSearchSource;
  if (options?.searchSource) {
    searchSource = options.searchSource;
    searchSource.resetState();
  } else {
    searchSource = new MentionsSearchSource(channel, { trigger: finalOptions.trigger });
  }
  searchSource.activate();
  // Tracks the cursor position of the most recently inserted mention so the
  // VERY NEXT change (typically a controlled value echo on some platforms)
  // can suppress the dropdown even when the text shape heuristic in `onChange`
  // would otherwise let it reopen (which is wrong). Consumed on the first
  // `onChange` after it's set, so any user driven event that triggers it would
  // clear it.
  let lastInsertedMentionEndOffset: number | undefined;
  return {
    id: 'stream-io/text-composer/mentions-middleware',
    handlers: {
      onChange: ({ state, next, complete, forward }) => {
        if (!state.selection) return forward();
        const cursorJustInsertedAMention =
          lastInsertedMentionEndOffset !== undefined &&
          state.selection.end === lastInsertedMentionEndOffset;
        lastInsertedMentionEndOffset = undefined;
        // Only prune stale mentions during normal text editing. Entering command mode
        // clears text/mentions through the `command.activate` effect, which first
        // snapshots the previous TextComposer state so it can be restored on
        // `clearCommand()`. Custom middleware is allowed to remove that effect,
        // though, and in that opt-out case we must not silently drop mentions
        // here just because the user typed a raw command like `/ban`.
        const currentMentions =
          state.command || state.text.trimStart().startsWith('/')
            ? state.mentionedUsers
            : getMentionedUsersInText(state.text, state.mentionedUsers);
        const mentionedUsersChanged =
          currentMentions.length !== state.mentionedUsers.length ||
          currentMentions.some(
            (user, index) => user.id !== state.mentionedUsers[index]?.id,
          );
        const stateWithMentions = mentionedUsersChanged
          ? { ...state, mentionedUsers: currentMentions }
          : state;

        const textBeforeCursor = stateWithMentions.text.slice(
          0,
          stateWithMentions.selection.end,
        );

        const triggerWithToken = getTriggerCharWithToken({
          trigger: finalOptions.trigger,
          text: textBeforeCursor,
        });

        const newSearchTriggered =
          triggerWithToken && triggerWithToken.length === finalOptions.minChars;

        if (newSearchTriggered) {
          searchSource.resetStateAndActivate();
        }

        // The trigger detection regex above also accepts `@<token><trailing-space>`
        // as "active" so users can keep refining a partial mention they typed by
        // hand. That falsely reopens the dropdown when the cursor sits at the
        // trailing space boundary of a mention the user has already committed
        // (post suggestion select or manual cursor placement back into that slot).
        //
        // Discriminate that case by checking, for each entity in
        // `state.mentions`, whether the text immediately before the cursor
        // ends with the entity's actual inserted textual form (`@<name|id> `)
        // AND that form appears exactly once in the prefix. This:
        //   - avoids false positives when an entity's `id` happens to match a
        //     different `@<token>` the user just typed (e.g. user "John Doe"
        //     whose id is "john" and the user types a fresh `@ivan ` later);
        //   - avoids false positives when the user is refining a brand new
        //     mention whose query equals an already committed mention name
        //     (text has two `@<name> ` occurrences; only one is committed, the
        //     cursor is most likely on the new one being typed).
        const triggerMatchesCommittedMention =
          !!triggerWithToken &&
          /\s$/.test(textBeforeCursor) &&
          (cursorJustInsertedAMention ||
            (stateWithMentions.mentions ?? []).some((entity) => {
              const insertedToken = entity.name ?? entity.id;
              if (!insertedToken) return false;
              const insertedForm = `@${insertedToken} `;
              if (!textBeforeCursor.endsWith(insertedForm)) return false;
              const escapedInsertedForm = insertedForm.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&',
              );
              const occurrences = textBeforeCursor.match(
                new RegExp(escapedInsertedForm, 'g'),
              );
              return (occurrences?.length ?? 0) === 1;
            }));

        const triggerWasRemoved =
          !triggerWithToken || triggerWithToken.length < finalOptions.minChars;

        if (triggerWasRemoved || triggerMatchesCommittedMention) {
          const hasStaleSuggestions =
            stateWithMentions.suggestions?.trigger === finalOptions.trigger;
          const newState = { ...stateWithMentions };
          if (hasStaleSuggestions) {
            delete newState.suggestions;
          }
          return next(newState);
        }

        searchSource.config.textComposerText = stateWithMentions.text;

        return complete({
          ...stateWithMentions,
          suggestions: {
            query: triggerWithToken.slice(1),
            searchSource,
            trigger: finalOptions.trigger,
          },
        });
      },
      onSuggestionItemSelect: ({ state, complete, forward }) => {
        const { selectedSuggestion } = state.change ?? {};
        if (!selectedSuggestion || state.suggestions?.trigger !== finalOptions.trigger)
          return forward();

        searchSource.resetStateAndActivate();
        const mentionEntity = mentionSuggestionToEntity(selectedSuggestion);
        const mentions = upsertMentionEntity(
          state.mentions ?? userResponsesToMentionEntities(state.mentionedUsers),
          mentionEntity,
        );
        const insertResult = insertItemWithTrigger({
          insertText: mentionSuggestionToInsertText(selectedSuggestion),
          selection: state.selection,
          text: state.text,
          trigger: finalOptions.trigger,
        });
        // Hand off the just inserted cursor position to the next `onChange`
        // so it can suppress the dropdown even when the text shape heuristic
        // doesn't catch a reselection of the same entity (multiple
        // occurrences of `@<name> ` in the text for exammple).
        lastInsertedMentionEndOffset = insertResult.selection.end;
        return complete({
          ...state,
          ...insertResult,
          mentionedUsers:
            selectedSuggestion.mentionType === 'user'
              ? upsertUserResponse(
                  state.mentionedUsers,
                  userSuggestionToUserResponse(selectedSuggestion),
                )
              : state.mentionedUsers,
          mentions,
          suggestions: undefined,
        });
      },
    },
  };
};
