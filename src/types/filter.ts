import { UserResponse, ChannelResponse, MessageResponse } from './response';

import { LiteralStringForUnion } from './base';

import {
  UnknownType,
  RequireAtLeastOne,
  RequireOnlyOne,
  ArrayOneOrMore,
  ArrayTwoOrMore,
} from './util';

/**
 * Filter Types
 */

export type AscDesc = 1 | -1;

export type BannedUsersFilterOptions = {
  banned_by_id?: string;
  channel_cid?: string;
  created_at?: string;
  reason?: string;
  user_id?: string;
};

export type BannedUsersFilters = QueryFilters<
  {
    channel_cid?:
      | RequireOnlyOne<
          Pick<QueryFilter<BannedUsersFilterOptions['channel_cid']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<BannedUsersFilterOptions['channel_cid']>;
  } & {
    reason?:
      | RequireOnlyOne<
          {
            $autocomplete?: BannedUsersFilterOptions['reason'];
          } & QueryFilter<BannedUsersFilterOptions['reason']>
        >
      | PrimitiveFilter<BannedUsersFilterOptions['reason']>;
  } & {
      [Key in keyof Omit<BannedUsersFilterOptions, 'channel_cid' | 'reason'>]:
        | RequireOnlyOne<QueryFilter<BannedUsersFilterOptions[Key]>>
        | PrimitiveFilter<BannedUsersFilterOptions[Key]>;
    }
>;

export type ChannelFilters<
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType = UnknownType
> = QueryFilters<
  ContainsOperator<ChannelType> & {
    members?:
      | RequireOnlyOne<Pick<QueryFilter<string>, '$in' | '$nin'>>
      | RequireOnlyOne<Pick<QueryFilter<string[]>, '$eq'>>
      | PrimitiveFilter<string[]>;
  } & {
    name?:
      | RequireOnlyOne<
          {
            $autocomplete?: ChannelResponse<ChannelType, CommandType, UserType>['name'];
          } & QueryFilter<ChannelResponse<ChannelType, CommandType, UserType>['name']>
        >
      | PrimitiveFilter<ChannelResponse<ChannelType, CommandType, UserType>['name']>;
  } & {
      [Key in keyof Omit<
        ChannelResponse<{}, CommandType, UserType>,
        'name' | 'members'
      >]:
        | RequireOnlyOne<QueryFilter<ChannelResponse<{}, CommandType, UserType>[Key]>>
        | PrimitiveFilter<ChannelResponse<{}, CommandType, UserType>[Key]>;
    }
>;

export type ContainsOperator<CustomType = {}> = {
  [Key in keyof CustomType]?: CustomType[Key] extends (infer ContainType)[]
    ?
        | RequireOnlyOne<
            {
              $contains?: ContainType extends object
                ? PrimitiveFilter<RequireAtLeastOne<ContainType>>
                : PrimitiveFilter<ContainType>;
            } & QueryFilter<PrimitiveFilter<ContainType>[]>
          >
        | PrimitiveFilter<PrimitiveFilter<ContainType>[]>
    : RequireOnlyOne<QueryFilter<CustomType[Key]>> | PrimitiveFilter<CustomType[Key]>;
};

export type MessageFilters<
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = QueryFilters<
  ContainsOperator<MessageType> & {
    text?:
      | RequireOnlyOne<
          {
            $autocomplete?: MessageResponse<
              AttachmentType,
              ChannelType,
              CommandType,
              MessageType,
              ReactionType,
              UserType
            >['text'];
            $q?: MessageResponse<
              AttachmentType,
              ChannelType,
              CommandType,
              MessageType,
              ReactionType,
              UserType
            >['text'];
          } & QueryFilter<
            MessageResponse<
              AttachmentType,
              ChannelType,
              CommandType,
              MessageType,
              ReactionType,
              UserType
            >['text']
          >
        >
      | PrimitiveFilter<
          MessageResponse<
            AttachmentType,
            ChannelType,
            CommandType,
            MessageType,
            ReactionType,
            UserType
          >['text']
        >;
  } & {
      [Key in keyof Omit<
        MessageResponse<
          AttachmentType,
          ChannelType,
          CommandType,
          {},
          ReactionType,
          UserType
        >,
        'text'
      >]?:
        | RequireOnlyOne<
            QueryFilter<
              MessageResponse<
                AttachmentType,
                ChannelType,
                CommandType,
                {},
                ReactionType,
                UserType
              >[Key]
            >
          >
        | PrimitiveFilter<
            MessageResponse<
              AttachmentType,
              ChannelType,
              CommandType,
              {},
              ReactionType,
              UserType
            >[Key]
          >;
    }
>;

export type PrimitiveFilter<ObjectType> = ObjectType | null;

export type QueryFilter<ObjectType = string> = NonNullable<ObjectType> extends
  | string
  | number
  | boolean
  ? {
      $eq?: PrimitiveFilter<ObjectType>;
      $exists?: boolean;
      $gt?: PrimitiveFilter<ObjectType>;
      $gte?: PrimitiveFilter<ObjectType>;
      $in?: PrimitiveFilter<ObjectType>[];
      $lt?: PrimitiveFilter<ObjectType>;
      $lte?: PrimitiveFilter<ObjectType>;
      $ne?: PrimitiveFilter<ObjectType>;
      $nin?: PrimitiveFilter<ObjectType>[];
    }
  : {
      $eq?: PrimitiveFilter<ObjectType>;
      $exists?: boolean;
      $in?: PrimitiveFilter<ObjectType>[];
      $ne?: PrimitiveFilter<ObjectType>;
      $nin?: PrimitiveFilter<ObjectType>[];
    };

export type QueryFilters<Operators = {}> = {
  [Key in keyof Operators]?: Operators[Key];
} &
  QueryLogicalOperators<Operators>;

export type QueryLogicalOperators<Operators> = {
  $and?: ArrayOneOrMore<QueryFilters<Operators>>;
  $nor?: ArrayOneOrMore<QueryFilters<Operators>>;
  $or?: ArrayTwoOrMore<QueryFilters<Operators>>;
};

export type UserFilters<UserType = UnknownType> = QueryFilters<
  ContainsOperator<UserType> & {
    id?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse<UserType>['id'] } & QueryFilter<
            UserResponse<UserType>['id']
          >
        >
      | PrimitiveFilter<UserResponse<UserType>['id']>;
    name?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse<UserType>['name'] } & QueryFilter<
            UserResponse<UserType>['name']
          >
        >
      | PrimitiveFilter<UserResponse<UserType>['name']>;
    teams?:
      | RequireOnlyOne<{
          $contains?: PrimitiveFilter<string>;
          $eq?: PrimitiveFilter<UserResponse<UserType>['teams']>;
        }>
      | PrimitiveFilter<UserResponse<UserType>['teams']>;
    username?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse<UserType>['username'] } & QueryFilter<
            UserResponse<UserType>['username']
          >
        >
      | PrimitiveFilter<UserResponse<UserType>['username']>;
  } & {
      [Key in keyof Omit<UserResponse<{}>, 'id' | 'name' | 'teams' | 'username'>]?:
        | RequireOnlyOne<QueryFilter<UserResponse<{}>[Key]>>
        | PrimitiveFilter<UserResponse<{}>[Key]>;
    }
>;

/**
 * Sort Types
 */

export type BannedUsersSort = BannedUsersSortBase | Array<BannedUsersSortBase>;

export type BannedUsersSortBase = { created_at?: AscDesc };

export type ChannelSort<ChannelType = UnknownType> =
  | ChannelSortBase<ChannelType>
  | Array<ChannelSortBase<ChannelType>>;

export type ChannelSortBase<ChannelType = UnknownType> = Sort<ChannelType> & {
  created_at?: AscDesc;
  has_unread?: AscDesc;
  last_message_at?: AscDesc;
  last_updated?: AscDesc;
  member_count?: AscDesc;
  unread_count?: AscDesc;
  updated_at?: AscDesc;
};

export type Sort<T> = {
  [P in keyof T]?: AscDesc;
};

export type UserSort<UserType = UnknownType> =
  | Sort<UserResponse<UserType>>
  | Array<Sort<UserResponse<UserType>>>;

export type QuerySort<ChannelType = UnknownType, UserType = UnknownType> =
  | BannedUsersSort
  | ChannelSort<ChannelType>
  | UserSort<UserType>;
