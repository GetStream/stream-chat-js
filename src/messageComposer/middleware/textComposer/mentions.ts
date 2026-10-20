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
import {
  BaseSearchSource,
  type SearchQueryOptions,
  type SearchSourceOptions,
} from '../../../search';
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
  SearchUserGroupsOptions,
  SortParamRequest,
  UserFilters,
  UserGroupResponse,
  UserOptions,
  UserResponse,
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
  /** Base filters for the app-wide user query (`mentionAllAppUsers`). */
  userFilters?: UserFilters;
  userSort?: SortParamRequest[];
  /**
   * Replaces the default `name` autocomplete filter of the channel member query, so the typed text
   * is not applied.
   */
  memberFilters?: MemberFilters;
  memberSort?: SortParamRequest[];
  searchOptions?: Omit<UserOptions, 'limit' | 'offset'>;
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
      // All members are returned (groups hold at most 100), so this equals `members.length`.
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
  userSort: SortParamRequest[] | undefined;
  memberSort: SortParamRequest[] | undefined; // todo: document there are filters and sort options for users and members
  searchOptions: Omit<UserOptions, 'limit' | 'offset'> | undefined;
  config: Pick<
    MentionsSearchSourceOptions,
    'mentionAllAppUsers' | 'suggestionFactoryMappers' | 'textComposerText' | 'trigger'
  >;

  constructor(channel: Channel, options?: MentionsSearchSourceOptions) {
    const {
      mentionAllAppUsers,
      memberFilters,
      memberSort,
      searchOptions,
      suggestionFactoryMappers,
      textComposerText,
      transliterate,
      trigger,
      userFilters,
      userSort,
      ...restOptions
    } = options || {};
    // A bare trigger shows suggestions, so the empty query must be allowed.
    super({ ...restOptions, allowEmptySearchString: true });
    this.client = channel.getClient();
    this.channel = channel;
    this.userFilters = userFilters;
    this.userSort = userSort;
    this.memberFilters = memberFilters;
    this.memberSort = memberSort;
    this.searchOptions = searchOptions;
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
      items, // kept to avoid flickering
    };
  }

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

  getRoleMentionSuggestions = async (
    query: string,
    queryOptions: SearchQueryOptions = {},
  ): Promise<RoleMentionSuggestion[]> => {
    if (!this.isMentionTypeAllowed('role')) return [];
    if (!query) return [];
    const { roles } = await this.client.searchRoles({ query }, queryOptions);
    return [...(roles?.map((role) => role.name) ?? [])]
      .sort((left, right) => left.localeCompare(right))
      .map((role) => this.toRoleMentionSuggestion(role, query));
  };

  searchMembersLocally = (searchQuery: string) => {
    const { textComposerText } = this.config;
    if (!textComposerText) return [];

    return this.getMembersAndWatchers()
      .filter((user) => {
        if (user.id === this.client.userId) return false;
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

        // Criteria apply in order.
        for (const { field, direction } of this.memberSort) {
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
    sort:
      this.userSort ??
      ([
        { field: 'name', direction: 1 },
        { field: 'id', direction: 1 },
      ] satisfies SortParamRequest[]), // todo: document the change - the sort is overridden, not merged
    options: { ...this.searchOptions, limit: this.pageSize, offset },
  });

  prepareQueryMembersParams = (searchQuery: string, offset = 0) => {
    // QueryMembers accepts at most one sort item.
    let sort: SortParamRequest[] = [{ field: 'user_id', direction: 1 }];
    if (!this.memberSort || !this.memberSort.length) {
      sort = [{ field: 'user_id', direction: 1 }];
    } else {
      sort = this.memberSort.slice(0, 1);
    } // todo: document the change - the sort is overridden, not merged
    return {
      // todo: document the change - the filter is overridden, not merged
      filters:
        this.memberFilters ?? ({ name: { $autocomplete: searchQuery } } as MemberFilters), // autocomplete possible only for name
      sort,
      options: { ...this.searchOptions, limit: this.pageSize, offset },
    };
  };

  queryUsers = async (
    searchQuery: string,
    offset = 0,
    queryOptions: SearchQueryOptions = {},
  ) => {
    const { filters, sort, options } = this.prepareQueryUsersParams(searchQuery, offset);
    const { users } = await this.client.queryUsers(
      {
        payload: {
          filter_conditions: filters,
          sort,
          ...options,
        },
      },
      queryOptions,
    );
    return users;
  };

  queryMembers = async (
    searchQuery: string,
    offset = 0,
    queryOptions: SearchQueryOptions = {},
  ) => {
    const { filters, sort, options } = this.prepareQueryMembersParams(
      searchQuery,
      offset,
    );
    const response = await this.channel.queryMembers(
      {
        payload: {
          filter_conditions: filters,
          sort,
          ...options,
        },
      },
      queryOptions,
    );

    return response.members.map((member) => member.user) as UserResponse[];
  };

  getUserSuggestionsPage = async (
    searchQuery: string,
    userOffset = 0,
    queryOptions: SearchQueryOptions = {},
  ) => {
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
      users = await this.queryUsers(searchQuery, userOffset, queryOptions);
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
      users = await this.queryMembers(searchQuery, userOffset, queryOptions);
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

  getUserGroupSuggestionsPage = async (
    searchQuery: string,
    cursor?: string,
    queryOptions: SearchQueryOptions = {},
  ) => {
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
    const { user_groups } = await this.client.searchUserGroups(options, queryOptions);

    return {
      items: user_groups.map((userGroup) =>
        this.toUserGroupMentionSuggestion(userGroup, searchQuery),
      ),
      next: this.buildUserGroupSearchCursor(user_groups),
    };
  };

  async query(searchQuery: string, queryOptions: SearchQueryOptions = {}) {
    const userOffset = this.offset ?? 0;
    const isFirstPage = userOffset === 0 && typeof this.userGroupCursor === 'undefined';
    const previousUserPaginationState = this.latestUserPaginationState;
    const previousUserGroupCursor = this.userGroupCursor;
    const [userResultsState, userGroupResultsState, roleSuggestionsState] =
      await Promise.allSettled([
        this.getUserSuggestionsPage(searchQuery, userOffset, queryOptions),
        this.getUserGroupSuggestionsPage(
          searchQuery,
          previousUserGroupCursor,
          queryOptions,
        ),
        isFirstPage
          ? this.getRoleMentionSuggestions(searchQuery, queryOptions)
          : Promise.resolve([] as RoleMentionSuggestion[]),
      ]);

    // On abort the requests reject, and the fallbacks below would overwrite the newer query's cursors.
    if (queryOptions.signal?.aborted) return { items: [] };

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
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          mutedUsers.some((mute) => mute.target!.id === suggestion.id),
      );
    }
    return data.filter(
      (suggestion) =>
        suggestion.mentionType !== 'user' ||
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        mutedUsers.every((mute) => mute.target!.id !== suggestion.id),
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

export type MentionsMiddleware = Middleware<
  TextComposerMiddlewareExecutorState<MentionSuggestion>,
  'onChange' | 'onSuggestionItemSelect'
>;

/**
 * Suggests and inserts mentions.
 *
 * @param channel - The channel to search mentions in.
 * @param options - Middleware options. Defaults to `trigger: '@'` and `minChars: 1`.
 * @param options.searchSource - A search source to use instead of a new one. Its state is reset.
 * @returns The mentions middleware.
 */
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
  // Cursor end of the last inserted mention. The next `onChange` (e.g. a controlled value echo) uses
  // it to keep the dropdown closed, then clears it.
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
        // Prune stale mentions only outside command mode: a raw `/ban` typed without the
        // `command.activate` effect (custom middleware may remove it) must not drop them.
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

        // The trigger regex also accepts `@<token><trailing-space>`, which would reopen the dropdown
        // after a committed mention. Detect that case: the text before the cursor ends with an entity's
        // inserted form (`@<name|id> `) that occurs exactly once (twice means a new one is being typed).
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
        // Lets the next `onChange` keep the dropdown closed when the text heuristic cannot tell (e.g.
        // repeated `@<name> ` occurrences).
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
