export type QueryBannedUsersPayloadFilterConditions = {
  banned_by_id: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  channel_cid: { type: string; operators: '$eq' | '$in' };
  created_at: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  reason: {
    type: string;
    operators:
      | '$autocomplete'
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  user_id: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
};

export type QueryChannelsRequestFilterConditions = {
  app_banned: { type: string; operators: '$eq' };
  archived: { type: boolean; operators: '$eq' };
  blocked: { type: boolean; operators: '$eq' };
  channel_role: { type: string; operators: '$eq' | '$in' };
  cid: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  created_at: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  created_by_id: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  disabled: { type: boolean; operators: '$eq' };
  distinct: { type: boolean; operators: '$eq' };
  filter_tags: { type: string; operators: '$eq' | '$in' };
  frozen: {
    type: boolean;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  has_unread: { type: boolean; operators: '$eq' };
  hidden: { type: boolean; operators: '$eq' };
  id: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  invite: { type: string; operators: '$eq' };
  joined: { type: boolean; operators: '$eq' };
  last_message_at: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  last_updated: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  'member.user.name': { type: string; operators: '$autocomplete' | '$eq' | '$ne' };
  member_count: {
    type: number;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  members: { type: string; operators: '$eq' | '$in' | '$nin' };
  message_count: {
    type: number;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  muted: { type: boolean; operators: '$eq' };
  name: {
    type: string;
    operators:
      | '$autocomplete'
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin'
      | '$q';
  };
  pinned: { type: boolean; operators: '$eq' };
  team: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  type: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  updated_at: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
};

export type QueryMembersPayloadFilterConditions = {
  banned: { type: boolean; operators: '$eq' };
  channel_role: { type: string; operators: '$eq' | '$in' };
  cid: { type: string; operators: '$eq' };
  created_at: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  id: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  invite: { type: string; operators: '$eq' };
  is_moderator: { type: boolean; operators: '$eq' | '$ne' };
  joined: { type: boolean; operators: '$eq' };
  last_active: { type: Date; operators: '$eq' | '$gt' | '$gte' | '$lt' | '$lte' | '$ne' };
  name: {
    type: string;
    operators: '$autocomplete' | '$eq' | '$in' | '$ne' | '$nin' | '$q';
  };
  notifications_muted: { type: boolean; operators: '$eq' };
  updated_at: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  'user.email': {
    type: string;
    operators: '$autocomplete' | '$eq' | '$in' | '$ne' | '$nin' | '$q';
  };
  'user.nd_deactivated': { type: boolean; operators: '$eq' };
  user_id: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
};

export type QueryMessageFlagsPayloadFilterConditions = {
  action: { type: string; operators: '$eq' };
  blocklist_name: { type: string; operators: '$eq' };
  channel_cid: { type: string; operators: '$eq' | '$in' };
  date_range: { type: string; operators: '$eq' };
  harm_label: { type: string; operators: '$eq' };
  harm_type: { type: string; operators: '$eq' };
  image_labels: { type: string; operators: '$eq' };
  is_reviewed: { type: boolean; operators: '$eq' };
  keyword: { type: string; operators: '$eq' };
  matched_phrase: { type: string; operators: '$eq' };
  message_id: { type: string; operators: '$eq' | '$in' };
  phrase_list_ids: { type: number; operators: '$eq' };
  reason: { type: string; operators: '$eq' | '$in' };
  reporter_id: { type: string; operators: '$eq' };
  reporter_type: { type: string; operators: '$eq' };
  team: { type: string; operators: '$eq' | '$in' };
  user_id: { type: string; operators: '$eq' | '$in' };
};

export type QueryUsersPayloadFilterConditions = {
  banned: { type: boolean; operators: '$eq' };
  bypass_moderation: { type: boolean; operators: '$eq' | '$ne' };
  created_at: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  email: { type: string; operators: '$eq' | '$in' };
  id: {
    type: string;
    operators:
      | '$autocomplete'
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  language: { type: string; operators: '$eq' | '$ne' };
  last_active: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  name: {
    type: string;
    operators:
      | '$autocomplete'
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  role: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  shadow_banned: { type: boolean; operators: '$eq' | '$ne' };
  teams: { type: string; operators: '$_none' | '$contains' | '$eq' | '$in' };
  updated_at: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  username: { type: string; operators: '$autocomplete' | '$eq' };
};

export type SearchPayloadFilterConditions = {
  app_banned: { type: string; operators: '$eq' };
  archived: { type: boolean; operators: '$eq' };
  blocked: { type: boolean; operators: '$eq' };
  channel_role: { type: string; operators: '$eq' | '$in' };
  cid: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  created_at: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  created_by_id: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  disabled: { type: boolean; operators: '$eq' };
  distinct: { type: boolean; operators: '$eq' };
  filter_tags: { type: string; operators: '$eq' | '$in' };
  frozen: {
    type: boolean;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  has_unread: { type: boolean; operators: '$eq' };
  hidden: { type: boolean; operators: '$eq' };
  id: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  invite: { type: string; operators: '$eq' };
  joined: { type: boolean; operators: '$eq' };
  last_message_at: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  last_updated: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  'member.user.name': { type: string; operators: '$autocomplete' | '$eq' | '$ne' };
  member_count: {
    type: number;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  members: { type: string; operators: '$eq' | '$in' | '$nin' };
  message_count: {
    type: number;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  muted: { type: boolean; operators: '$eq' };
  name: {
    type: string;
    operators:
      | '$autocomplete'
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin'
      | '$q';
  };
  pinned: { type: boolean; operators: '$eq' };
  team: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  type: {
    type: string;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
  updated_at: {
    type: Date;
    operators:
      | '$eq'
      | '$exists'
      | '$gt'
      | '$gte'
      | '$in'
      | '$lt'
      | '$lte'
      | '$ne'
      | '$nin';
  };
};
