import SeamlessImmutable from 'seamless-immutable';

export type User<T = { [key: string]: unknown }> = T & {
  id: string;
  role?: string;
};

export type TokenOrProvider = string | TokenProvider | null | undefined;
export type TokenProvider = () => Promise<string>;

export type ConnectionChangeEvent = {
  type: 'connection.changed' | 'connection.recovered';
  online?: boolean;
};

export type Logger = (
  logLevel: 'info' | 'error',
  message: string,
  extraData?: Record<string, unknown>,
) => void;

export type Event<T = string, U = { [key: string]: unknown }> = U & {
  cid: string;
  type: T;
  message?: MessageResponse;
  reaction?: ReactionResponse;
  channel?: ChannelResponse;
  member?: ChannelMemberResponse;
  user?: UserResponse;
  user_id?: string;
  me?: OwnUserResponse;
  watcher_count?: number;
  unread_count?: number;
  online?: boolean;
  created_at?: string;
  connection_id?: string;
  received_at?: string;
};

export type EventHandler = (event: Event) => void;

export type Message<T = { [key: string]: unknown }> = T & {
  text?: string;
  attachments?: Attachment[];
  mentioned_users?: string[];
  parent_id?: string;
};

export type MessageResponse<
  T = { [key: string]: unknown },
  ReactionType = { [key: string]: unknown }
> = T & {
  id: string;
  text: string;
  attachments?: Attachment[];
  parent_id?: string;
  mentioned_users?: UserResponse[];
  command?: string;
  user?: User;
  html: string;
  type: string;
  latest_reactions?: ReactionResponse<ReactionType>[];
  own_reactions?: ReactionResponse<ReactionType>[];
  reaction_counts?: { [key: string]: number };
  reaction_scores?: { [key: string]: number };
  show_in_channel?: boolean;
  reply_count?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  status?: string;
};

export type ImmutableMessageResponse<
  T = { [key: string]: unknown },
  ReactionType = { [key: string]: unknown }
> = SeamlessImmutable.Immutable<
  T & {
    __html: string;
    id: string;
    text: string;
    attachments?: Attachment[];
    parent_id?: string;
    mentioned_users?: UserResponse[];
    command?: string;
    user?: User;
    html: string;
    type: string;
    latest_reactions?: ReactionResponse<ReactionType>[];
    own_reactions?: ReactionResponse<ReactionType>[];
    reaction_counts?: { [key: string]: number };
    reaction_scores?: { [key: string]: number };
    show_in_channel?: boolean;
    reply_count?: number;
    created_at: Date;
    updated_at: Date;
    deleted_at?: string;
    status: string;
  }
>;

export interface ChannelMemberResponse {
  user_id?: string;
  user?: UserResponse;
  is_moderator?: boolean;
  invited?: boolean;
  invite_accepted_at?: string;
  invite_rejected_at?: string;
  role?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChannelMembership {
  user?: UserResponse;
  role?: string;
  created_at?: string;
  updated_at?: string;
}

export type Reaction<T = { [key: string]: unknown }> = T & {
  type: string;
  message_id?: string;
  user_id?: string;
  user?: User;
  score?: number;
};

export type ReactionResponse<T> = Reaction<T> & {
  created_at: string;
  updated_at: string;
};
