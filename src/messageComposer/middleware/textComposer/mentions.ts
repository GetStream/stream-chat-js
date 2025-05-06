import {
  getTokenizedSuggestionDisplayName,
  getTriggerCharWithToken,
  insertItemWithTrigger,
} from './textMiddlewareUtils';
import type { SearchSourceOptions } from '../../../search_controller';
import { BaseSearchSource } from '../../../search_controller';
import { mergeWith } from '../../../utils/mergeWith';
import type { TextComposerMiddlewareOptions, UserSuggestion } from './types';
import type { StreamChat } from '../../../client';
import type {
  MemberFilters,
  MemberSort,
  UserFilters,
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
  textComposerText?: string;
  // todo: document that if you want transliteration, you need to provide the function, e.g. import {default: transliterate}  from '@sindresorhus/transliterate';
  // this is now replacing a parameter useMentionsTransliteration
  transliterate?: (text: string) => string;
};

export class MentionsSearchSource extends BaseSearchSource<UserSuggestion> {
  readonly type = 'mentions';
  private client: StreamChat;
  private channel: Channel;
  userFilters: UserFilters | undefined;
  memberFilters: MemberFilters | undefined;
  userSort: UserSort | undefined;
  memberSort: MemberSort | undefined; // todo: document there are filters and sort options for users and members
  searchOptions: Omit<UserOptions, 'limit' | 'offset'> | undefined;
  config: MentionsSearchSourceOptions;

  constructor(channel: Channel, options?: MentionsSearchSourceOptions) {
    const { mentionAllAppUsers, textComposerText, transliterate, ...restOptions } =
      options || {};
    super(restOptions);
    this.client = channel.getClient();
    this.channel = channel;
    this.config = { mentionAllAppUsers, textComposerText };

    if (transliterate) {
      this.transliterate = transliterate;
    }
  }

  get allMembersLoadedWithInitialChannelQuery() {
    const countLoadedMembers = Object.keys(this.channel.state.members || {}).length;
    return countLoadedMembers < MAX_CHANNEL_MEMBER_COUNT_IN_CHANNEL_QUERY;
  }

  getStateBeforeFirstQuery(newSearchString: string) {
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

  searchMembersLocally = (searchQuery: string) => {
    const { textComposerText } = this.config;
    if (!textComposerText) return [];

    return this.getMembersAndWatchers()
      .filter((user) => {
        if (user.id === this.client.userID) return false;
        if (!searchQuery) return true;

        const updatedId = this.transliterate(removeDiacritics(user.id)).toLowerCase();
        const updatedName = this.transliterate(removeDiacritics(user.name)).toLowerCase();
        const updatedQuery = this.transliterate(
          removeDiacritics(searchQuery),
        ).toLowerCase();

        const maxDistance = 3;
        const lastDigits = textComposerText.slice(-(maxDistance + 1)).includes('@');

        if (updatedName) {
          const levenshtein = calculateLevenshtein(updatedQuery, updatedName);
          if (
            updatedName.includes(updatedQuery) ||
            (levenshtein <= maxDistance && lastDigits)
          ) {
            return true;
          }
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

  prepareQueryUsersParams = (searchQuery: string) => ({
    filters: {
      $or: [
        { id: { $autocomplete: searchQuery } },
        { name: { $autocomplete: searchQuery } },
      ],
      ...this.userFilters,
    } as UserFilters,
    sort: this.userSort ?? ([{ name: 1 }, { id: 1 }] as UserSort), // todo: document the change - the sort is overridden, not merged
    options: { ...this.searchOptions, limit: this.pageSize, offset: this.offset },
  });

  prepareQueryMembersParams = (searchQuery: string) => {
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
      options: { ...this.searchOptions, limit: this.pageSize, offset: this.offset },
    };
  };

  queryUsers = async (searchQuery: string) => {
    const { filters, sort, options } = this.prepareQueryUsersParams(searchQuery);
    const { users } = await this.client.queryUsers(filters, sort, options);
    return users;
  };

  queryMembers = async (searchQuery: string) => {
    const { filters, sort, options } = this.prepareQueryMembersParams(searchQuery);
    const response = await this.channel.queryMembers(filters, sort, options);

    return response.members.map((member) => member.user) as UserResponse[];
  };

  async query(searchQuery: string) {
    let users: UserResponse[];
    const shouldSearchLocally =
      this.allMembersLoadedWithInitialChannelQuery || !searchQuery;

    if (this.config.mentionAllAppUsers) {
      users = await this.queryUsers(searchQuery);
    } else if (shouldSearchLocally) {
      users = this.searchMembersLocally(searchQuery);
    } else {
      users = await this.queryMembers(searchQuery);
    }

    return {
      items: users.map(
        (user) =>
          ({
            ...user,
            ...getTokenizedSuggestionDisplayName({
              displayName: user.name || user.id,
              searchToken: this.searchQuery,
            }),
          }) as UserSuggestion,
      ),
    };
  }

  filterMutes = (data: UserSuggestion[]) => {
    const { textComposerText } = this.config;
    if (!textComposerText) return [];

    const { mutedUsers } = this.client;
    if (textComposerText.includes('/unmute') && !mutedUsers.length) {
      return [];
    }
    if (!mutedUsers.length) return data;

    if (textComposerText.includes('/unmute')) {
      return data.filter((suggestion) =>
        mutedUsers.some((mute) => mute.target.id === suggestion.id),
      );
    }
    return data.filter((suggestion) =>
      mutedUsers.every((mute) => mute.target.id !== suggestion.id),
    );
  };

  filterQueryResults(items: UserSuggestion[]) {
    return this.filterMutes(items);
  }
}

const DEFAULT_OPTIONS: TextComposerMiddlewareOptions = { minChars: 1, trigger: '@' };

const userSuggestionToUserResponse = (suggestion: UserSuggestion): UserResponse => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tokenizedDisplayName, ...userResponse } = suggestion;
  return userResponse;
};

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
  TextComposerMiddlewareExecutorState<UserSuggestion>,
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
    searchSource = new MentionsSearchSource(channel);
  }
  searchSource.activate();
  return {
    id: 'stream-io/text-composer/mentions-middleware',
    handlers: {
      onChange: ({ state, next, complete, forward }) => {
        if (!state.selection) return forward();

        const triggerWithToken = getTriggerCharWithToken({
          trigger: finalOptions.trigger,
          text: state.text.slice(0, state.selection.end),
        });

        const newSearchTriggered =
          triggerWithToken && triggerWithToken.length === finalOptions.minChars;

        if (newSearchTriggered) {
          searchSource.resetStateAndActivate();
        }

        const triggerWasRemoved =
          !triggerWithToken || triggerWithToken.length < finalOptions.minChars;

        if (triggerWasRemoved) {
          const hasStaleSuggestions = state.suggestions?.trigger === finalOptions.trigger;
          const newState = { ...state };
          if (hasStaleSuggestions) {
            delete newState.suggestions;
          }
          return next(newState);
        }

        searchSource.config.textComposerText = state.text;

        return complete({
          ...state,
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
        return complete({
          ...state,
          ...insertItemWithTrigger({
            insertText: `@${selectedSuggestion.name || selectedSuggestion.id} `,
            selection: state.selection,
            text: state.text,
            trigger: finalOptions.trigger,
          }),
          mentionedUsers: state.mentionedUsers.concat(
            userSuggestionToUserResponse(selectedSuggestion),
          ),
          suggestions: undefined,
        });
      },
    },
  };
};
