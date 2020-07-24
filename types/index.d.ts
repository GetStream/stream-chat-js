/// <reference types="seamless-immutable" />
/// <reference types="node" />
/// <reference types="ws" />
declare module "src/base64" {
    export const encodeBase64: (data: string) => string;
    export const decodeBase64: (s: string) => string;
}
declare module "src/types" {
    import SeamlessImmutable from 'seamless-immutable';
    import { Channel } from "src/channel";
    import { AxiosRequestConfig } from 'axios';
    /**
     * Utility Types
     */
    export type ArrayOneOrMore<T> = {
        0: T;
    } & Array<T>;
    export type ArrayTwoOrMore<T> = {
        0: T;
        1: T;
    } & Array<T>;
    export type KnownKeys<T> = {
        [K in keyof T]: string extends K ? never : number extends K ? never : K;
    } extends {
        [_ in keyof T]: infer U;
    } ? U : never;
    export type RequireAtLeastOne<T> = {
        [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>;
    }[keyof T];
    export type RequireOnlyOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> & {
        [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>>;
    }[Keys];
    export type UnknownType<T = Record<string, unknown>> = T;
    /**
     * Response Types
     */
    export type APIResponse = {
        duration: string;
    };
    export type AppSettingsAPIResponse = APIResponse & {
        app?: {
            channel_configs: {
                automod?: ChannelConfigAutomod;
                automod_behavior?: ChannelConfigAutomodBehavior;
                commands?: CommandVariants[];
                connect_events?: boolean;
                created_at?: string;
                max_message_length?: number;
                message_retention?: string;
                mutes?: boolean;
                name?: string;
                reactions?: boolean;
                read_events?: boolean;
                replies?: boolean;
                search?: boolean;
                typing_events?: boolean;
                updated_at?: string;
                uploads?: boolean;
                url_enrichment?: boolean;
            };
            disable_auth_checks?: boolean;
            disable_permissions_checks?: boolean;
            name?: string;
            organization?: string;
            policies?: Record<string, Policy[]>;
            push_notifications?: {
                apn?: APNConfig;
                firebase?: FirebaseConfig;
            };
            suspended?: boolean;
            suspended_explanation?: string;
            webhook_url?: string;
        };
    };
    export type ChannelResponse<ChannelType = UnknownType, UserType = UnknownType> = ChannelType & {
        cid: string;
        frozen: boolean;
        id: string;
        type: string;
        config?: ChannelConfigWithInfo;
        created_at?: string;
        created_by?: UserResponse<UserType>;
        created_by_id?: string;
        deleted_at?: string;
        image?: string;
        invites?: string[];
        last_message_at?: string;
        member_count?: number;
        members?: ChannelMemberResponse<UserType>[];
        name?: string;
        team?: string;
        updated_at?: string;
    };
    export type ChannelAPIResponse<ChannelType = UnknownType, AttachmentType = UnknownType, MessageType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = APIResponse & {
        channel: ChannelResponse<ChannelType, UserType>;
        members: ChannelMemberResponse<UserType>[];
        messages: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>[];
        membership?: ChannelMembership<UserType>;
        read?: ReadResponse<UserType>[];
        watcher_count?: number;
        watchers?: UserResponse<UserType>[];
    };
    export type ChannelMemberAPIResponse<UserType = UnknownType> = APIResponse & {
        members: ChannelMemberResponse<UserType>[];
    };
    export type ChannelMemberResponse<UserType = UnknownType> = {
        created_at?: string;
        invite_accepted_at?: string;
        invite_rejected_at?: string;
        invited?: boolean;
        is_moderator?: boolean;
        role?: string;
        updated_at?: string;
        user?: UserResponse<UserType>;
        user_id?: string;
    };
    export type CheckPushResponse = APIResponse & {
        device_errors?: {
            error_message?: string;
            provider?: string;
        };
        general_errors?: string[];
        rendered_apn_template?: string;
        rendered_firebase_template?: string;
    };
    export type CommandResponse = {
        args?: string;
        description?: string;
        name?: string;
        set?: string;
    };
    export type CreateChannelResponse = Omit<GetChannelTypeResponse, 'commands'>;
    export type DeleteChannelAPIResponse<ChannelType = UnknownType, UserType = UnknownType> = APIResponse & {
        channel: ChannelResponse<ChannelType, UserType>;
    };
    export type EventAPIResponse<EventType = UnknownType, AttachmentType = UnknownType, ChannelType = UnknownType, MessageType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = APIResponse & {
        event: Event<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>;
    };
    export type FlagMessageResponse<UserType> = {
        duration: string;
        flag: {
            created_at: string;
            created_by_automod: boolean;
            target_message_id: string;
            target_user: UserResponse<UserType>;
            updated_at: string;
            user: UserResponse<UserType>;
            approved_at?: string;
            rejected_at?: string;
            reviewed_at?: string;
            reviewed_by?: string;
        };
    };
    export type GetChannelTypeResponse = Omit<CreateChannelOptions, 'client_id' | 'connect_events' | 'connection_id'> & {
        created_at: string;
        duration: string;
        updated_at: string;
    };
    export type GetMultipleMessagesAPIResponse<MessageType = UnknownType, AttachmentType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = APIResponse & {
        messages: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>[];
    };
    export type GetReactionsAPIResponse<ReactionType, UserType> = APIResponse & {
        reactions: ReactionResponse<ReactionType, UserType>[];
    };
    export type GetRepliesAPIResponse<MessageType = UnknownType, AttachmentType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = APIResponse & {
        messages: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>[];
    };
    export type ImmutableMessageResponse<MessageType = UnknownType, AttachmentType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = SeamlessImmutable.Immutable<Omit<MessageResponse<MessageType, AttachmentType, ReactionType, UserType>, 'created_at' | 'updated_at' | 'status'> & {
        __html: string;
        created_at: Date;
        status: string;
        updated_at: Date;
    }>;
    export type ListChannelResponse = {
        channel_types: Omit<CreateChannelOptions, 'client_id' | 'connection_id'> & {
            created_at: string;
            updated_at: string;
        };
        duration: string;
    };
    export type MuteChannelAPIResponse<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType> = APIResponse & {
        channel_mute: ChannelMute<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>;
        channel_mutes: ChannelMute<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>[];
        mute: MuteResponse<UserType>;
        own_user: OwnUserResponse<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>;
    };
    export type MessageResponse<MessageType = UnknownType, AttachmentType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = MessageBase<MessageType, AttachmentType, UserType> & {
        command?: string;
        created_at?: string;
        deleted_at?: string;
        latest_reactions?: ReactionResponse<ReactionType, UserType>[];
        mentioned_users?: UserResponse<UserType>[];
        own_reactions?: ReactionResponse<ReactionType, UserType>[];
        reaction_counts?: {
            [key: string]: number;
        };
        reaction_scores?: {
            [key: string]: number;
        };
        reply_count?: number;
        silent?: boolean;
        status?: string;
        type?: string;
        updated_at?: string;
        user?: UserResponse<UserType>;
    };
    export type MuteResponse<UserType> = {
        user: UserResponse<UserType>;
        created_at?: string;
        target?: UserResponse<UserType>;
        updated_at?: string;
    };
    export type MuteUserResponse<UserType> = {
        duration: string;
        mute: MuteResponse<UserType>;
        mutes: Array<Mute<UserType>>;
        own_user: UserResponse<UserType>;
    };
    export type OwnUserResponse<AttachmentType = UnknownType, ChannelType = UnknownType, EventType = UnknownType, MessageType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = UserResponse<UserType> & {
        channel_mutes: ChannelMute<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>[];
        devices: Device<UserType>[];
        mutes: Mute<UserType>[];
        total_unread_count: number;
        unread_channels: number;
        unread_count: number;
    };
    export type ReactionAPIResponse<ReactionType = UnknownType, AttachmentType = UnknownType, MessageType = UnknownType, UserType = UnknownType> = APIResponse & {
        message: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>;
        reaction: ReactionResponse<ReactionType, UserType>;
    };
    export type ReactionResponse<ReactionType, UserType> = Reaction<ReactionType, UserType> & {
        created_at: string;
        updated_at: string;
    };
    export type ReadResponse<UserType> = {
        last_read: string;
        user: UserResponse<UserType>;
    };
    export type SearchAPIResponse<MessageType = UnknownType, AttachmentType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = APIResponse & {
        results: {
            message: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>;
        }[];
    };
    export type SendEventAPIResponse<T = string> = APIResponse & {
        event: Event<T>;
    };
    export type SendFileAPIResponse = SendImageAPIResponse;
    export type SendImageAPIResponse = APIResponse & {
        file: string;
    };
    export type SendMessageAPIResponse<MessageType = UnknownType, AttachmentType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = APIResponse & {
        message: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>;
    };
    export type TruncateChannelAPIResponse<ChannelType = UnknownType, UserType = UnknownType> = APIResponse & {
        channel: ChannelResponse<ChannelType, UserType>;
    };
    export type UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType> = APIResponse & {
        channel: ChannelResponse<ChannelType, UserType>;
        members: ChannelMemberResponse<UserType>[];
        message?: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>;
    };
    export type UserResponse<T> = User<T> & {
        created_at?: string;
        deactivated_at?: string;
        deleted_at?: string;
        last_active?: string;
        online?: boolean;
        updated_at?: string;
    };
    export type UpdateChannelResponse = Omit<CreateChannelOptions, 'client_id' | 'connection_id'> & {
        created_at: string;
        duration: string;
        updated_at: string;
    };
    /**
     * Option Types
     */
    export type BanUserOptions<UserType> = UnBanUserOptions & {
        reason?: string;
        timeout?: number;
        user?: UserResponse<UserType>;
        user_id?: string;
    };
    export type ChannelOptions = {
        last_message_ids?: {
            [key: string]: string;
        };
        limit?: number;
        message_limit?: number;
        offset?: number;
        presence?: boolean;
        recovery?: boolean;
        state?: boolean;
        watch?: boolean;
    };
    export type CreateChannelOptions = {
        automod?: ChannelConfigAutomod;
        automod_behavior?: ChannelConfigAutomodBehavior;
        client_id?: string;
        commands?: CommandVariants[];
        connect_events?: boolean;
        connection_id?: string;
        max_message_length?: number;
        message_retention?: string;
        mutes?: boolean;
        name?: string;
        permissions?: PermissionObject[];
        reactions?: boolean;
        read_events?: boolean;
        replies?: boolean;
        search?: boolean;
        typing_events?: boolean;
        uploads?: boolean;
        url_enrichment?: boolean;
    };
    export type CustomPermissionOptions = {
        name: string;
        resource: string;
        condition?: string;
        owner?: boolean;
        same_team?: boolean;
    };
    export type ChannelQueryOptions<ChannelType, UserType> = {
        client_id?: string;
        connection_id?: string;
        data?: ChannelResponse<ChannelType, UserType>;
        members?: PaginationOptions;
        messages?: PaginationOptions;
        presence?: boolean;
        state?: boolean;
        watch?: boolean;
        watchers?: PaginationOptions;
    };
    export type FlagMessageOptions<UserType> = {
        client_id?: string;
        connection_id?: string;
        created_by?: string;
        target_message_id?: string;
        target_user_id?: string;
        user?: UserResponse<UserType>;
        user_id?: string;
    };
    export type InviteOptions<AttachmentType, ChannelType, MessageType, ReactionType, UserType> = {
        accept_invite?: boolean;
        add_members?: string[];
        add_moderators?: string[];
        client_id?: string;
        connection_id?: string;
        data?: Omit<ChannelResponse<ChannelType, UserType>, 'id' | 'cid'>;
        demote_moderators?: string[];
        invites?: string[];
        message?: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>;
        reject_invite?: boolean;
        remove_members?: string[];
        user?: UserResponse<UserType>;
        user_id?: string;
    };
    export type MarkAllReadOptions<UserType> = {
        client_id?: string;
        connection_id?: string;
        user?: UserResponse<UserType>;
        user_id?: string;
    };
    export type MarkReadOptions<UserType> = {
        client_id?: string;
        connection_id?: string;
        message_id?: string;
        user?: UserResponse<UserType>;
        user_id?: string;
    };
    export type PaginationOptions = {
        id_gt?: number;
        id_gte?: number;
        id_lt?: number;
        id_lte?: number;
        limit?: number;
        offset?: number;
    };
    export type SearchOptions = {
        limit?: number;
        offset?: number;
    };
    export type StreamChatOptions = AxiosRequestConfig & {
        browser?: boolean;
        logger?: Logger;
    };
    export type UnBanUserOptions = {
        client_id?: string;
        connection_id?: string;
        id?: string;
        target_user_id?: string;
        type?: string;
    };
    export type UpdateChannelOptions = Omit<CreateChannelOptions, 'name'> & {
        created_at?: string;
        updated_at?: string;
    };
    export type UserOptions = {
        limit?: number;
        offset?: number;
        presence?: boolean;
    };
    /**
     * Event Types
     */
    export type ConnectionChangeEvent = {
        type: EventTypes;
        online?: boolean;
    };
    export type Event<EventType = UnknownType, AttachmentType = UnknownType, ChannelType = UnknownType, MessageType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = EventType & {
        type: EventTypes;
        channel?: ChannelResponse<ChannelType, UserType>;
        cid?: string;
        clear_history?: boolean;
        connection_id?: string;
        created_at?: string;
        me?: OwnUserResponse<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>;
        member?: ChannelMemberResponse<UserType>;
        message?: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>;
        online?: boolean;
        reaction?: ReactionResponse<ReactionType, UserType>;
        received_at?: string | Date;
        unread_count?: number;
        user?: UserResponse<UserType>;
        user_id?: string;
        watcher_count?: number;
    };
    export type EventHandler<EventType = UnknownType, AttachmentType = UnknownType, ChannelType = UnknownType, MessageType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = (event: Event<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>) => void;
    export type EventTypes = 'all' | 'user.presence.changed' | 'user.watching.start' | 'user.watching.stop' | 'user.deleted' | 'user.updated' | 'user.banned' | 'user.unbanned' | 'typing.start' | 'typing.stop' | 'message.new' | 'message.updated' | 'message.deleted' | 'message.read' | 'reaction.new' | 'reaction.deleted' | 'reaction.updated' | 'member.added' | 'member.updated' | 'member.removed' | 'channel.created' | 'channel.updated' | 'channel.deleted' | 'channel.truncated' | 'channel.hidden' | 'channel.muted' | 'channel.unmuted' | 'channel.visible' | 'health.check' | 'notification.message_new' | 'notification.mark_read' | 'notification.invited' | 'notification.invite_accepted' | 'notification.added_to_channel' | 'notification.removed_from_channel' | 'notification.channel_deleted' | 'notification.channel_mutes_updated' | 'notification.channel_truncated' | 'notification.mutes_updated' | 'connection.changed' | 'connection.recovered';
    /**
     * Filter Types
     */
    export type AscDesc = 1 | -1;
    export type ChannelFilters<ChannelType = UnknownType<{}>, UserType = UnknownType> = QueryFilters<ChannelResponse<ChannelType, UserType>, ContainsOperator<ChannelType> & {
        name?: RequireOnlyOne<{
            $autocomplete?: ChannelResponse<ChannelType, UserType>['name'];
        } & QueryFilter<ChannelResponse<ChannelType, UserType>['name']>> | PrimitiveFilter<ChannelResponse<ChannelType, UserType>['name']>;
    }>;
    export type ContainsOperator<CustomType = {}> = {
        [Key in keyof CustomType]?: CustomType[Key] extends (infer ContainType)[] ? RequireOnlyOne<{
            $contains?: ContainType extends object ? PrimitiveFilter<RequireAtLeastOne<ContainType>> : PrimitiveFilter<ContainType>;
        } & QueryFilter<PrimitiveFilter<ContainType>[]>> | PrimitiveFilter<PrimitiveFilter<ContainType>[]> : RequireOnlyOne<QueryFilter<CustomType[Key]>> | PrimitiveFilter<CustomType[Key]>;
    };
    export type MessageFilters<MessageType = UnknownType<{}>, AttachmentType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = QueryFilters<MessageResponse<MessageType, AttachmentType, ReactionType, UserType>, ContainsOperator<MessageType> & {
        text?: RequireOnlyOne<{
            $autocomplete?: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>['text'];
            $q?: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>['text'];
        } & QueryFilter<MessageResponse<MessageType, AttachmentType, ReactionType, UserType>['text']>> | PrimitiveFilter<MessageResponse<MessageType, AttachmentType, ReactionType, UserType>['text']>;
    }>;
    export type PrimitiveFilter<ObjectType> = ObjectType | null;
    export type QueryFilter<ObjectType = string> = ObjectType extends string | number | boolean ? {
        $eq?: PrimitiveFilter<ObjectType>;
        $exists?: boolean;
        $gt?: PrimitiveFilter<ObjectType>;
        $gte?: PrimitiveFilter<ObjectType>;
        $in?: PrimitiveFilter<ObjectType>[];
        $lt?: PrimitiveFilter<ObjectType>;
        $lte?: PrimitiveFilter<ObjectType>;
        $ne?: PrimitiveFilter<ObjectType>;
        $nin?: PrimitiveFilter<ObjectType>[];
    } : {
        $eq?: PrimitiveFilter<ObjectType>;
        $exists?: boolean;
        $in?: PrimitiveFilter<ObjectType>[];
        $ne?: PrimitiveFilter<ObjectType>;
        $nin?: PrimitiveFilter<ObjectType>[];
    };
    export type QueryFilters<QueryField = UnknownType, SpecialOperators = {}> = {
        [Key in keyof Omit<QueryField, keyof SpecialOperators>]?: PrimitiveFilter<QueryField[Key]> | RequireOnlyOne<QueryFilter<QueryField[Key]>>;
    } & {
        [Key in keyof SpecialOperators]?: SpecialOperators[Key];
    } & QueryLogicalOperators<QueryField, SpecialOperators>;
    export type QueryLogicalOperators<QueryField, SpecialOperators> = {
        $and?: ArrayOneOrMore<QueryFilters<QueryField, SpecialOperators>>;
        $nor?: ArrayOneOrMore<QueryFilters<QueryField, SpecialOperators>>;
        $or?: ArrayTwoOrMore<QueryFilters<QueryField, SpecialOperators>>;
    };
    export type UserFilters<UserType = UnknownType<{}>> = QueryFilters<UserResponse<UserType>, ContainsOperator<UserType> & {
        id?: RequireOnlyOne<{
            $autocomplete?: UserResponse<UserType>['id'];
        } & QueryFilter<UserResponse<UserType>['id']>> | PrimitiveFilter<UserResponse<UserType>['id']>;
        name?: RequireOnlyOne<{
            $autocomplete?: UserResponse<UserType>['name'];
        } & QueryFilter<UserResponse<UserType>['name']>> | PrimitiveFilter<UserResponse<UserType>['name']>;
        teams?: RequireOnlyOne<{
            $contains?: PrimitiveFilter<string>;
            $eq?: PrimitiveFilter<UserResponse<UserType>['teams']>;
        }> | PrimitiveFilter<UserResponse<UserType>['teams']>;
        username?: RequireOnlyOne<{
            $autocomplete?: UserResponse<UserType>['username'];
        } & QueryFilter<UserResponse<UserType>['username']>> | PrimitiveFilter<UserResponse<UserType>['username']>;
    }>;
    /**
     * Sort Types
     */
    export type ChannelSort<ChannelType = Record<string, unknown>> = Sort<ChannelType> & {
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
    export type UserSort<UserType> = Sort<UserResponse<UserType>>;
    /**
     * Base Types
     */
    export type Action = {
        name?: string;
        style?: string;
        text?: string;
        type?: string;
        value?: string;
    };
    export type APNConfig = {
        auth_type?: string;
        bundle_id?: string;
        development?: boolean;
        enabled?: boolean;
        host?: string;
        key_id?: string;
        notification_template?: string;
        team_id?: string;
    };
    export type AppSettings = {
        firebase_config: {
            data_template?: string;
            notification_template?: string;
            server_key?: string;
        };
        apn_config?: {
            auth_key?: string;
            auth_type?: string;
            bundle_id?: string;
            development?: boolean;
            host?: string;
            key_id?: string;
            notification_template?: string;
            p12_cert?: string;
            team_id?: string;
        };
        disable_auth_checks?: boolean;
        disable_permissions_checks?: boolean;
        webhook_url?: string;
    };
    export type Attachment<T = UnknownType> = T & {
        actions?: Action[];
        asset_url?: string;
        author_icon?: string;
        author_link?: string;
        author_name?: string;
        color?: string;
        fallback?: string;
        fields?: Field[];
        footer?: string;
        footer_icon?: string;
        image_url?: string;
        og_scrape_url?: string;
        pretext?: string;
        text?: string;
        thumb_url?: string;
        title?: string;
        title_link?: string;
        type?: string;
    };
    export type ChannelConfig = ChannelConfigFields & ChannelConfigDBFields & {
        commands?: CommandVariants[];
    };
    export type ChannelConfigAutomod = 'disabled' | 'simple' | 'AI';
    export type ChannelConfigAutomodBehavior = 'flag' | 'block';
    export type ChannelConfigDBFields = {
        created_at: string;
        updated_at: string;
    };
    export type ChannelConfigFields = {
        automod?: ChannelConfigAutomod;
        automod_behavior?: ChannelConfigAutomodBehavior;
        connect_events?: boolean;
        max_message_length?: number;
        message_retention?: string;
        mutes?: boolean;
        name?: string;
        reactions?: boolean;
        read_events?: boolean;
        replies?: boolean;
        search?: boolean;
        typing_events?: boolean;
        uploads?: boolean;
        url_enrichment?: boolean;
    };
    export type ChannelConfigWithInfo = ChannelConfigFields & ChannelConfigDBFields & {
        commands?: CommandResponse[];
    };
    export type ChannelData<ChannelType = UnknownType> = ChannelType & {
        image?: string;
        members?: string[];
        name?: string;
    };
    export type ChannelMembership<UserType = UnknownType> = {
        created_at?: string;
        role?: string;
        updated_at?: string;
        user?: UserResponse<UserType>;
    };
    export type ChannelMute<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType> = {
        user: UserResponse<UserType>;
        channel?: Channel<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>;
        created_at?: string;
        expires?: string;
        updated_at?: string;
    };
    export type CheckPushInput<UserType> = {
        apn_template?: string;
        client_id?: string;
        connection_id?: string;
        firebase_data_template?: string;
        firebase_template?: string;
        message_id?: string;
        user?: UserResponse<UserType>;
        user_id?: string;
    };
    export type CommandVariants = 'all' | 'fun_set' | 'moderation_set' | 'giphy' | 'imgur' | 'flag' | 'ban' | 'unban' | 'mute' | 'unmute';
    export type Configs = {
        [channel_type: string]: ChannelConfigWithInfo | undefined;
    };
    export type ConnectionOpen<UserType> = {
        connection_id: string;
        cid?: string;
        created_at?: string;
        me?: {
            created_at?: string;
            devices?: Device<UserType>[];
            id?: string;
            image?: string;
            invisible?: boolean;
            last_active?: string;
            mutes?: Mute<UserType>[];
            name?: string;
            online?: boolean;
            role?: string;
            total_unread_count?: number;
            unread_count?: number;
            updated_at?: string;
        };
    };
    export type Device<UserType> = DeviceFields & {
        provider?: string;
        user?: UserResponse<UserType>;
        user_id?: string;
    };
    export type DeviceFields = {
        id?: string;
        push_providers?: 'apn' | 'firebase';
    };
    export type Field = {
        short?: boolean;
        title?: string;
        value?: string;
    };
    export type FirebaseConfig = {
        data_template?: string;
        enabled?: boolean;
        notification_template?: string;
    };
    export type Logger = (logLevel: 'info' | 'error', message: string, extraData?: Record<string, unknown>) => void;
    export type Message<MessageType = UnknownType, AttachmentType = UnknownType, UserType = UnknownType> = MessageBase<MessageType, AttachmentType, UserType> & {
        mentioned_users?: string[];
        user?: UserResponse<UserType>;
    };
    export type MessageBase<MessageType = UnknownType, AttachmentType = UnknownType, UserType = UnknownType> = MessageType & {
        attachments?: Attachment<AttachmentType>[];
        html?: string;
        id?: string;
        parent_id?: string;
        show_in_channel?: boolean;
        text?: string;
        user_id?: string;
    };
    export type Mute<UserType> = {
        created_at: string;
        target: UserResponse<UserType>;
        updated_at: string;
        user: UserResponse<UserType>;
    };
    export type PermissionObject = {
        action?: 'Deny' | 'Allow';
        name?: string;
        owner?: boolean;
        priority?: number;
        resources?: string[];
        roles?: string[];
    };
    export type Policy = {
        action?: 0 | 1;
        created_at?: string;
        name?: string;
        owner?: boolean;
        priority?: number;
        resources?: string[];
        roles?: string[];
        updated_at?: string;
    };
    export type Reaction<ReactionType = UnknownType, UserType = UnknownType> = ReactionType & {
        type: string;
        message_id?: string;
        score?: number;
        user?: UserResponse<UserType>;
        user_id?: string;
    };
    export type SearchPayload<AttachmentType = UnknownType, ChannelType = UnknownType, MessageType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> = SearchOptions & {
        client_id?: string;
        connection_id?: string;
        filter_conditions?: ChannelFilters<Pick<ChannelType, KnownKeys<ChannelType>>, UserType>;
        message_filter_conditions?: QueryFilters<MessageResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        query?: string;
    };
    export type TestPushDataInput = {
        apnTemplate?: string;
        firebaseDataTemplate?: string;
        firebaseTemplate?: string;
        messageID?: string;
    };
    export type TokenOrProvider = string | TokenProvider | null | undefined;
    export type TokenProvider = () => Promise<string>;
    export type User<T = UnknownType> = Partial<T> & {
        id: string;
        anon?: boolean;
        name?: string;
        role?: string;
        teams?: string[];
        username?: string;
    };
}
declare module "src/channel_state" {
    import Immutable from 'seamless-immutable';
    import { Channel } from "src/channel";
    import { ChannelMembership, ChannelMemberResponse, Event, MessageResponse, ReactionResponse, UnknownType, UserResponse } from "src/types";
    /**
     * ChannelState - A container class for the channel state.
     */
    export class ChannelState<AttachmentType = UnknownType, ChannelType = UnknownType, EventType = UnknownType, MessageType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> {
        _channel: Channel<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>;
        watcher_count: number;
        typing: Immutable.ImmutableObject<{
            [key: string]: Immutable.Immutable<Event<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>>;
        }>;
        read: Immutable.ImmutableObject<{
            [key: string]: Immutable.Immutable<{
                last_read: Date;
                user: UserResponse<UserType>;
            }>;
        }>;
        messages: Immutable.ImmutableArray<ReturnType<ChannelState<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>>;
        threads: Immutable.ImmutableObject<{
            [key: string]: Immutable.ImmutableArray<ReturnType<ChannelState<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>>;
        }>;
        mutedUsers: Immutable.ImmutableArray<UserResponse<UserType>>;
        watchers: Immutable.ImmutableObject<{
            [key: string]: Immutable.Immutable<UserResponse<UserType>>;
        }>;
        members: Immutable.ImmutableObject<{
            [key: string]: Immutable.Immutable<ChannelMemberResponse<UserType>>;
        }>;
        membership: Immutable.ImmutableObject<ChannelMembership<UserType>>;
        last_message_at: Date | null;
        constructor(channel: Channel<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>);
        /**
         * addMessageSorted - Add a message to the state
         *
         * @param {MessageResponse<MessageType, AttachmentType, ReactionType, UserType>} newMessage A new message
         *
         */
        addMessageSorted(newMessage: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>): void;
        /**
         * messageToImmutable - Takes the message object. Parses the dates, sets __html
         * and sets the status to received if missing. Returns an immutable message object
         *
         * @param {MessageResponse<MessageType, AttachmentType, ReactionType, UserType>} message an Immutable message object
         *
         */
        messageToImmutable(message: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>): Immutable.Immutable<MessageType & {
            attachments?: import("src/types").Attachment<AttachmentType>[] | undefined;
            html?: string | undefined;
            id?: string | undefined;
            parent_id?: string | undefined;
            show_in_channel?: boolean | undefined;
            text?: string | undefined;
            user_id?: string | undefined;
        } & {
            __html: string | undefined;
            created_at: Date;
            updated_at: Date;
            status: string;
            command?: string | undefined;
            deleted_at?: string | undefined;
            latest_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
            mentioned_users?: UserResponse<UserType>[] | undefined;
            own_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
            reaction_counts?: {
                [key: string]: number;
            } | undefined;
            reaction_scores?: {
                [key: string]: number;
            } | undefined;
            reply_count?: number | undefined;
            silent?: boolean | undefined;
            type?: string | undefined;
            user?: UserResponse<UserType> | undefined;
        }, {}>;
        /**
         * addMessagesSorted - Add the list of messages to state and resorts the messages
         *
         * @param {Array<MessageResponse<MessageType, AttachmentType, ReactionType, UserType>>} newMessages A list of messages
         * @param {boolean} initializing Weather channel is being initialized.
         *
         */
        addMessagesSorted(newMessages: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>[], initializing?: boolean): void;
        addReaction(reaction: ReactionResponse<ReactionType, UserType>, message?: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>): void;
        _addReactionToMessage(message: Immutable.Immutable<ReturnType<ChannelState<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>>, reaction: ReactionResponse<ReactionType, UserType>): false | Immutable.ImmutableObject<{
            attachments?: import("src/types").Attachment<AttachmentType>[] | undefined;
            html?: string | undefined;
            id?: string | undefined;
            parent_id?: string | undefined;
            show_in_channel?: boolean | undefined;
            text?: string | undefined;
            user_id?: string | undefined;
        } & {
            __html: string | undefined;
            created_at: Date;
            updated_at: Date;
            status: string;
            command?: string | undefined;
            deleted_at?: string | undefined;
            latest_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
            mentioned_users?: UserResponse<UserType>[] | undefined;
            own_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
            reaction_counts?: {
                [key: string]: number;
            } | undefined;
            reaction_scores?: {
                [key: string]: number;
            } | undefined;
            reply_count?: number | undefined;
            silent?: boolean | undefined;
            type?: string | undefined;
            user?: UserResponse<UserType> | undefined;
        }>;
        _removeReactionFromMessage(message: Immutable.Immutable<ReturnType<ChannelState<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>>, reaction: ReactionResponse<ReactionType, UserType>): Immutable.ImmutableObject<{
            attachments?: import("src/types").Attachment<AttachmentType>[] | undefined;
            html?: string | undefined;
            id?: string | undefined;
            parent_id?: string | undefined;
            show_in_channel?: boolean | undefined;
            text?: string | undefined;
            user_id?: string | undefined;
        } & {
            __html: string | undefined;
            created_at: Date;
            updated_at: Date;
            status: string;
            command?: string | undefined;
            deleted_at?: string | undefined;
            latest_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
            mentioned_users?: UserResponse<UserType>[] | undefined;
            own_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
            reaction_counts?: {
                [key: string]: number;
            } | undefined;
            reaction_scores?: {
                [key: string]: number;
            } | undefined;
            reply_count?: number | undefined;
            silent?: boolean | undefined;
            type?: string | undefined;
            user?: UserResponse<UserType> | undefined;
        }>;
        removeReaction(reaction: ReactionResponse<ReactionType, UserType>, message?: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>): void;
        /**
         * _addToMessageList - Adds a message to a list of messages, tries to update first, appends if message isnt found
         *
         * @param {Immutable.ImmutableArray<ReturnType<ChannelState<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>>} messages A list of messages
         * @param {ReturnType<ChannelState<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>} newMessage The new message
         *
         */
        _addToMessageList(messages: Immutable.ImmutableArray<ReturnType<ChannelState<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>>, newMessage: ReturnType<ChannelState<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>): Immutable.ImmutableArray<Immutable.Immutable<MessageType & {
            attachments?: import("src/types").Attachment<AttachmentType>[] | undefined;
            html?: string | undefined;
            id?: string | undefined;
            parent_id?: string | undefined;
            show_in_channel?: boolean | undefined;
            text?: string | undefined;
            user_id?: string | undefined;
        } & {
            __html: string | undefined;
            created_at: Date;
            updated_at: Date;
            status: string;
            command?: string | undefined;
            deleted_at?: string | undefined;
            latest_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
            mentioned_users?: UserResponse<UserType>[] | undefined;
            own_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
            reaction_counts?: {
                [key: string]: number;
            } | undefined;
            reaction_scores?: {
                [key: string]: number;
            } | undefined;
            reply_count?: number | undefined;
            silent?: boolean | undefined;
            type?: string | undefined;
            user?: UserResponse<UserType> | undefined;
        }, {}>>;
        /**
         * removeMessage - Description
         *
         * @param {{ id: string; parent_id?: string }} messageToRemove Object of the message to remove. Needs to have at id specified.
         *
         * @return {boolean} Returns if the message was removed
         */
        removeMessage(messageToRemove: {
            id: string;
            parent_id?: string;
        }): boolean;
        removeMessageFromArray: (msgArray: Immutable.ImmutableArray<ReturnType<ChannelState<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>>, msg: {
            id: string;
            parent_id?: string;
        }) => {
            removed: boolean;
            result: Immutable.ImmutableArray<Immutable.Immutable<MessageType & {
                attachments?: import("src/types").Attachment<AttachmentType>[] | undefined;
                html?: string | undefined;
                id?: string | undefined;
                parent_id?: string | undefined;
                show_in_channel?: boolean | undefined;
                text?: string | undefined;
                user_id?: string | undefined;
            } & {
                __html: string | undefined;
                created_at: Date;
                updated_at: Date;
                status: string;
                command?: string | undefined;
                deleted_at?: string | undefined;
                latest_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
                mentioned_users?: UserResponse<UserType>[] | undefined;
                own_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
                reaction_counts?: {
                    [key: string]: number;
                } | undefined;
                reaction_scores?: {
                    [key: string]: number;
                } | undefined;
                reply_count?: number | undefined;
                silent?: boolean | undefined;
                type?: string | undefined;
                user?: UserResponse<UserType> | undefined;
            }, {}>>;
        };
        /**
         * filterErrorMessages - Removes error messages from the channel state.
         *
         */
        filterErrorMessages(): void;
        /**
         * clean - Remove stale data such as users that stayed in typing state for more than 5 seconds
         */
        clean(): void;
        clearMessages(): void;
    }
}
declare module "src/events" {
    export const EVENT_MAP: {
        'user.presence.changed': boolean;
        'user.watching.start': boolean;
        'user.watching.stop': boolean;
        'user.updated': boolean;
        'user.deleted': boolean;
        'user.banned': boolean;
        'user.unbanned': boolean;
        'typing.start': boolean;
        'typing.stop': boolean;
        'message.new': boolean;
        'message.updated': boolean;
        'message.deleted': boolean;
        'message.read': boolean;
        'reaction.new': boolean;
        'reaction.deleted': boolean;
        'reaction.updated': boolean;
        'member.added': boolean;
        'member.updated': boolean;
        'member.removed': boolean;
        'channel.updated': boolean;
        'channel.muted': boolean;
        'channel.unmuted': boolean;
        'channel.deleted': boolean;
        'channel.truncated': boolean;
        'channel.created': boolean;
        'channel.hidden': boolean;
        'channel.visible': boolean;
        'health.check': boolean;
        'notification.message_new': boolean;
        'notification.mark_read': boolean;
        'notification.invited': boolean;
        'notification.invite_accepted': boolean;
        'notification.added_to_channel': boolean;
        'notification.removed_from_channel': boolean;
        'notification.mutes_updated': boolean;
        'notification.channel_deleted': boolean;
        'notification.channel_truncated': boolean;
        'notification.channel_mutes_updated': boolean;
        'connection.changed': boolean;
        'connection.recovered': boolean;
    };
    export const isValidEventType: (eventType: string) => boolean;
}
declare module "src/utils" {
    /**
     * logChatPromiseExecution - utility function for logging the execution of a promise..
     *  use this when you want to run the promise and handle errors by logging a warning
     *
     * @param {Promise<T>} promise The promise you want to run and log
     * @param {string} name    A descriptive name of what the promise does for log output
     *
     */
    export function logChatPromiseExecution<T>(promise: Promise<T>, name: string): void;
    export const sleep: (m: number) => Promise<void>;
    export function isFunction<T>(value: Function | T): value is Function;
    export const chatCodes: {
        TOKEN_EXPIRED: number;
        WS_CLOSED_SUCCESS: number;
    };
}
declare module "src/client_state" {
    import Immutable from 'seamless-immutable';
    import { UnknownType, UserResponse } from "src/types";
    /**
     * ClientState - A container class for the client state.
     */
    export class ClientState<UserType = UnknownType> {
        users: Immutable.ImmutableObject<{
            [key: string]: Immutable.Immutable<UserResponse<UserType>>;
        }>;
        userChannelReferences: {
            [key: string]: {
                [key: string]: boolean;
            };
        };
        constructor();
        updateUsers(users: UserResponse<UserType>[]): void;
        updateUser(user?: UserResponse<UserType>): void;
        updateUserReference(user: UserResponse<UserType>, channelID: string): void;
    }
}
declare module "src/signing" {
    import { Secret, SignOptions } from 'jsonwebtoken';
    import { UnknownType } from "src/types";
    /**
     * Creates the JWT token that can be used for a UserSession
     * @method JWTUserToken
     * @memberof signing
     * @private
     * @param {Secret} apiSecret - API Secret key
     * @param {string} userId - The user_id key in the JWT payload
     * @param {UnknownType} [extraData] - Extra that should be part of the JWT token
     * @param {SignOptions} [jwtOptions] - Options that can be past to jwt.sign
     * @return {string} JWT Token
     */
    export function JWTUserToken(apiSecret: Secret, userId: string, extraData?: UnknownType, jwtOptions?: SignOptions): string;
    export function JWTServerToken(apiSecret: Secret, jwtOptions?: SignOptions): string;
    export function UserFromToken(token: string): string;
    /**
     *
     * @param {string} userId the id of the user
     * @return {string}
     */
    export function DevToken(userId: string): string;
    /**
     *
     * @param {string} body the signed message
     * @param {string} secret the shared secret used to generate the signature (Stream API secret)
     * @param {string} signature the signature to validate
     * @return {boolean}
     */
    export function CheckSignature(body: string, secret: string, signature: string): boolean;
}
declare module "src/token_manager" {
    import { Secret } from 'jsonwebtoken';
    import { TokenOrProvider, UnknownType, UserResponse } from "src/types";
    /**
     * TokenManager
     *
     * Handles all the operations around user token.
     */
    export class TokenManager<UserType = UnknownType> {
        loadTokenPromise: Promise<string> | null;
        type: 'static' | 'provider';
        secret?: Secret;
        token?: string;
        tokenProvider?: TokenOrProvider;
        user?: UserResponse<UserType>;
        /**
         * Constructor
         *
         * @param {Secret} secret
         */
        constructor(secret?: Secret);
        /**
         * Set the static string token or token provider.
         * Token provider should return a token string or a promise which resolves to string token.
         *
         * @param {TokenOrProvider} tokenOrProvider
         * @param {UserResponse<UserType>} user
         */
        setTokenOrProvider: (tokenOrProvider: TokenOrProvider, user: UserResponse<UserType>) => Promise<void>;
        /**
         * Resets the token manager.
         * Useful for client disconnection or switching user.
         */
        reset: () => void;
        validateToken: (tokenOrProvider: TokenOrProvider, user: UserResponse<UserType>) => void;
        tokenReady: () => Promise<string> | null;
        loadToken: () => Promise<string>;
        getToken: () => string | undefined;
        isStatic: () => boolean;
    }
}
declare module "src/connection" {
    import isoWS from 'isomorphic-ws';
    import WebSocket from 'isomorphic-ws';
    import { TokenManager } from "src/token_manager";
    import { ConnectionChangeEvent, ConnectionOpen, Logger, UnknownType, UserResponse } from "src/types";
    type Constructor<UserType = UnknownType> = {
        apiKey: string;
        authType: 'anonymous' | 'jwt';
        clientID: string;
        eventCallback: (event: ConnectionChangeEvent) => void;
        logger: Logger | (() => void);
        messageCallback: (messageEvent: WebSocket.MessageEvent) => void;
        recoverCallback: (open?: ConnectionOpen<UserType>) => Promise<void>;
        tokenManager: TokenManager<UserType>;
        user: UserResponse<UserType>;
        userAgent: string;
        userID: string;
        wsBaseURL: string;
    };
    /**
     * StableWSConnection - A WS connection that reconnects upon failure.
     * - the browser will sometimes report that you're online or offline
     * - the WS connection can break and fail (there is a 30s health check)
     * - sometimes your WS connection will seem to work while the user is in fact offline
     * - to speed up online/offline detection you can use the window.addEventListener('offline');
     *
     * There are 4 ways in which a connection can become unhealthy:
     * - websocket.onerror is called
     * - websocket.onclose is called
     * - the health check fails and no event is received for ~40 seconds
     * - the browser indicates the connection is now offline
     *
     * There are 2 assumptions we make about the server:
     * - state can be recovered by querying the channel again
     * - if the servers fails to publish a message to the client, the WS connection is destroyed
     */
    export class StableWSConnection<UserType> {
        wsBaseURL: Constructor<UserType>['wsBaseURL'];
        clientID: Constructor<UserType>['clientID'];
        userID: Constructor<UserType>['userID'];
        user: Constructor<UserType>['user'];
        userAgent: Constructor<UserType>['userAgent'];
        authType: Constructor<UserType>['authType'];
        apiKey: Constructor<UserType>['apiKey'];
        tokenManager: Constructor<UserType>['tokenManager'];
        messageCallback: Constructor<UserType>['messageCallback'];
        recoverCallback: Constructor<UserType>['recoverCallback'];
        eventCallback: Constructor<UserType>['eventCallback'];
        logger: Constructor<UserType>['logger'];
        consecutiveFailures: number;
        healthCheckInterval: number;
        isConnecting: boolean;
        isHealthy: boolean;
        lastEvent: Date | null;
        monitorInterval: number;
        totalFailures: number;
        connectionID?: string;
        connectionOpen?: Promise<ConnectionOpen<UserType> | undefined>;
        healthCheckIntervalRef?: NodeJS.Timeout;
        isResolved?: boolean;
        monitorIntervalRef?: NodeJS.Timeout;
        rejectPromise?: (reason?: Error & {
            code?: string | number;
            isWSFailure?: boolean;
            StatusCode?: string | number;
        }) => void;
        resolvePromise?: (value?: WebSocket.MessageEvent) => void;
        ws?: isoWS;
        wsID: number;
        constructor({ wsBaseURL, clientID, userID, user, userAgent, apiKey, tokenManager, authType, messageCallback, recoverCallback, eventCallback, logger, }: Constructor<UserType>);
        /**
         * connect - Connect to the WS URL
         *
         * @return {Promise<ConnectionOpen<UserType> | void>} Promise that completes once the first health check message is received
         */
        connect(): Promise<void | ConnectionOpen<UserType>>;
        _buildUrl: () => string;
        /**
         * disconnect - Disconnect the connection and doesn't recover...
         *
         */
        disconnect(timeout?: number): Promise<void>;
        /**
         * _connect - Connect to the WS endpoint
         *
         * @return {Promise<ConnectionOpen<UserType> | undefined>} Promise that completes once the first health check message is received
         */
        _connect(): Promise<ConnectionOpen<UserType> | undefined>;
        /**
         * _reconnect - Retry the connection to WS endpoint
         *
         * @param {{ interval?: number; refreshToken?: boolean }} options Following options are available
         *
         * - `interval`	{int}			number of ms that function should wait before reconnecting
         * - `refreshToken` {boolean}	reload/refresh user token be refreshed before attempting reconnection.
         */
        _reconnect(options?: {
            interval?: number;
            refreshToken?: boolean;
        }): Promise<void>;
        /**
         * onlineStatusChanged - this function is called when the browser connects or disconnects from the internet.
         *
         * @param {Event} event Event with type online or offline
         *
         */
        onlineStatusChanged: (event: Event) => void;
        onopen: (wsID: number) => void;
        onmessage: (wsID: number, event: WebSocket.MessageEvent) => void;
        onclose: (wsID: number, event: WebSocket.CloseEvent) => void;
        onerror: (wsID: number, event: WebSocket.ErrorEvent) => void;
        /**
         * _setHealth - Sets the connection to healthy or unhealthy.
         * Broadcasts an event in case the connection status changed.
         *
         * @param {boolean} healthy boolean indicating if the connection is healthy or not
         *
         */
        _setHealth: (healthy: boolean) => void;
        /**
         * _errorFromWSEvent - Creates an error object for the WS event
         *
         */
        _errorFromWSEvent: (event: WebSocket.CloseEvent | WebSocket.Data | WebSocket.ErrorEvent, isWSFailure?: boolean) => Error & {
            code?: string | number | undefined;
            isWSFailure?: boolean | undefined;
            StatusCode?: string | number | undefined;
        };
        /**
         * _listenForConnectionChanges - Adds an event listener for the browser going online or offline
         *
         */
        _listenForConnectionChanges: () => void;
        _removeConnectionListeners: () => void;
        /**
         * _destroyCurrentWSConnection - Removes the current WS connection
         *
         */
        _destroyCurrentWSConnection(): void;
        /**
         * _retryInterval - A retry interval which increases after consecutive failures
         *
         * @return {number} Duration to wait in milliseconds
         */
        _retryInterval: () => number;
        /**
         * _setupPromise - sets up the this.connectOpen promise
         */
        _setupConnectionPromise: () => void;
        /**
         * _startHealthCheck - Sends a message every 30s or so to see if the ws connection still works
         *
         */
        _startHealthCheck(): void;
        /**
         * _startMonitor - Verifies we didn't miss any events. Marks the connection as failed in case we did.
         *
         */
        _startMonitor(): void;
    }
}
declare module "src/client" {
    import { AxiosRequestConfig, AxiosInstance, AxiosResponse } from 'axios';
    import WebSocket from 'ws';
    import { Channel } from "src/channel";
    import { ClientState } from "src/client_state";
    import { StableWSConnection } from "src/connection";
    import { TokenManager } from "src/token_manager";
    import { Configs, Logger, ConnectionOpen, TokenOrProvider, UserResponse, Event, EventHandler, ChannelMute, ChannelSort, ChannelOptions, ChannelAPIResponse, ChannelData, AppSettings, CheckPushResponse, TestPushDataInput, UserFilters, UserSort, UserOptions, SearchOptions, MessageResponse, ReactionResponse, BanUserOptions, UnBanUserOptions, MuteUserResponse, FlagMessageOptions, FlagMessageResponse, MarkAllReadOptions, StreamChatOptions, CreateChannelOptions, GetChannelTypeResponse, UpdateChannelOptions, UpdateChannelResponse, ListChannelResponse, APIResponse, CustomPermissionOptions, SearchAPIResponse, ChannelFilters, AppSettingsAPIResponse, UnknownType, KnownKeys, MessageFilters, Device } from "src/types";
    export class StreamChat<UserType = UnknownType, MessageType = UnknownType, ChannelType = UnknownType, AttachmentType = UnknownType, ReactionType = UnknownType, EventType = UnknownType> {
        key: string;
        secret?: string;
        listeners: {
            [key: string]: Array<(event: Event<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>) => void>;
        };
        state: ClientState<UserType>;
        mutedChannels: ChannelMute<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>[];
        browser: boolean;
        node: boolean;
        options: StreamChatOptions;
        axiosInstance: AxiosInstance;
        wsConnection: StableWSConnection<UserType> | null;
        wsPromise: Promise<void | ConnectionOpen<UserType>> | null;
        setUserPromise: Promise<void | ConnectionOpen<UserType>> | null;
        activeChannels: {
            [key: string]: Channel<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>;
        };
        configs: Configs;
        anonymous: boolean;
        tokenManager: TokenManager<UserType>;
        logger: Logger;
        baseURL?: string;
        wsBaseURL?: string;
        UUID?: string;
        userID?: string;
        clientID?: string;
        connectionID?: string;
        user?: UserResponse<UserType>;
        _user?: UserResponse<UserType>;
        cleaningIntervalRef?: NodeJS.Timeout;
        connectionEstablishedCount?: number;
        connecting?: boolean;
        failures?: number;
        constructor(key: string, options?: StreamChatOptions);
        constructor(key: string, secret?: string, options?: StreamChatOptions);
        devToken(userID: string): string;
        getAuthType(): "anonymous" | "jwt";
        setBaseURL(baseURL: string): void;
        _setupConnection: () => Promise<void | ConnectionOpen<UserType>>;
        _hasConnectionID: () => boolean;
        /**
         * setUser - Set the current user, this triggers a connection to the API
         *
         * @param {UserResponse<UserType>} user Data about this user. IE {name: "john"}
         * @param {TokenOrProvider} userTokenOrProvider Token or provider
         *
         * @return {Promise<void | ConnectionOpen<UserType>>} Returns a promise that resolves when the connection is setup
         */
        setUser: (user: UserResponse<UserType>, userTokenOrProvider: TokenOrProvider) => Promise<void | ConnectionOpen<UserType>>;
        _setToken: (user: UserResponse<UserType>, userTokenOrProvider: TokenOrProvider) => Promise<void>;
        _setUser(user: UserResponse<UserType>): void;
        /**
           * updateAppSettings - updates application settings
           *
           * @param {AppSettings} options App settings.
           * 		IE: {
                      "apn_config": {
                          "auth_type": "token",
                          "auth_key": fs.readFileSync(
                              './apn-push-auth-key.p8',
                              'utf-8',
                          ),
                          "key_id": "keyid",
                          "team_id": "teamid", //either ALL these 3
                          "notification_template": "notification handlebars template",
                          "bundle_id": "com.apple.your.app",
                          "development": true
                      },
                      "firebase_config": {
                          "server_key": "server key from fcm",
                          "notification_template": "notification handlebars template"
                          "data_template": "data handlebars template"
                      },
                      "webhook_url": "https://acme.com/my/awesome/webhook/"
                  }
           */
        updateAppSettings(options: AppSettings): Promise<APIResponse>;
        /**
         * getAppSettings - retrieves application settings
         */
        getAppSettings(): Promise<AppSettingsAPIResponse>;
        /**
           * testPushSettings - Tests the push settings for a user with a random chat message and the configured push templates
           *
           * @param {string} userID User ID. If user has no devices, it will error
           * @param {TestPushDataInput} [data] Overrides for push templates/message used
           * 		IE: {
                        messageID: 'id-of-message',//will error if message does not exist
                        apnTemplate: '{}', //if app doesn't have apn configured it will error
                        firebaseTemplate: '{}', //if app doesn't have firebase configured it will error
                        firebaseDataTemplate: '{}', //if app doesn't have firebase configured it will error
                  }
           */
        testPushSettings(userID: string, data?: TestPushDataInput): Promise<CheckPushResponse>;
        /**
         * disconnect - closes the WS connection
         */
        disconnect(timeout?: number): Promise<void>;
        setAnonymousUser: () => Promise<void | ConnectionOpen<UserType>>;
        /**
         * setGuestUser - Setup a temporary guest user
         *
         * @param {UserResponse<UserType>} user Data about this user. IE {name: "john"}
         *
         * @return {Promise<void | ConnectionOpen<UserType>>} Returns a promise that resolves when the connection is setup
         */
        setGuestUser(user: UserResponse<UserType>): Promise<void | ConnectionOpen<UserType>>;
        /**
         * createToken - Creates a token to authenticate this user. This function is used server side.
         * The resulting token should be passed to the client side when the users registers or logs in
         *
         * @param {string} userID The User ID
         * @param {number} [exp] The expiration time for the token expressed in the number of seconds since the epoch
         *
         * @return {string} Returns a token
         */
        createToken(userID: string, exp?: number): string;
        /**
         * on - Listen to events on all channels and users your watching
         *
         * client.on('message.new', event => {console.log("my new message", event, channel.state.messages)})
         * or
         * client.on(event => {console.log(event.type)})
         *
         * @param {EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType> | string} callbackOrString  The event type to listen for (optional)
         * @param {EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>} [callbackOrNothing] The callback to call
         *
         * @return {{ unsubscribe: () => void }} Description
         */
        on(callback: EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>): {
            unsubscribe: () => void;
        };
        on(eventType: string, callback: EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>): {
            unsubscribe: () => void;
        };
        /**
         * off - Remove the event handler
         *
         */
        off(callback: EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>): void;
        off(eventType: string, callback: EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>): void;
        _logApiRequest(type: string, url: string, data: unknown, config: AxiosRequestConfig & {
            config?: AxiosRequestConfig & {
                maxBodyLength?: number;
            };
        }): void;
        _logApiResponse<T>(type: string, url: string, response: AxiosResponse<T>): void;
        _logApiError(type: string, url: string, error: unknown): void;
        doAxiosRequest: <T>(type: string, url: string, data?: unknown, options?: AxiosRequestConfig & {
            config?: AxiosRequestConfig & {
                maxBodyLength?: number;
            };
        }) => Promise<T>;
        get<T>(url: string, params?: AxiosRequestConfig['params']): Promise<T>;
        put<T>(url: string, data?: unknown): Promise<T>;
        post<T>(url: string, data?: unknown): Promise<T>;
        patch<T>(url: string, data?: unknown): Promise<T>;
        delete<T>(url: string, params?: AxiosRequestConfig['params']): Promise<T>;
        sendFile<T>(url: string, uri: string | Buffer | File, name?: string, contentType?: string, user?: UserResponse<UserType>): Promise<T>;
        errorFromResponse<T>(response: AxiosResponse<T & {
            code?: number;
            message?: string;
        }>): Error & {
            code?: number | undefined;
            response?: AxiosResponse<T> | undefined;
            status?: number | undefined;
        };
        handleResponse<T>(response: AxiosResponse<T>): T;
        dispatchEvent: (event: Event<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>) => void;
        handleEvent: (messageEvent: WebSocket.MessageEvent) => void;
        _handleClientEvent(event: Event<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>): void;
        _muteStatus(cid: string): {
            muted: boolean;
            createdAt: null;
            expiresAt: null;
        };
        _callClientListeners: (event: Event<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>) => void;
        recoverState: () => Promise<void>;
        _updateUserReferences(user: UserResponse<UserType>): void;
        connect(): Promise<void | ConnectionOpen<UserType>>;
        /**
         * queryUsers - Query users and watch user presence
         *
         * @param {UserFilters<Pick<UserType, KnownKeys<UserType>>>} filterConditions MongoDB style filter conditions
         * @param {UserSort<UserType>} sort Sort options, for instance {last_active: -1}
         * @param {UserOptions} options Option object, {presence: true}
         *
         * @return {Promise<APIResponse & { users: Array<UserResponse<UserType>> }>} User Query Response
         */
        queryUsers(filterConditions: UserFilters<Pick<UserType, KnownKeys<UserType>>>, sort?: UserSort<UserType>, options?: UserOptions): Promise<APIResponse & {
            users: Array<UserResponse<UserType>>;
        }>;
        queryChannels(filterConditions: ChannelFilters<Pick<ChannelType, KnownKeys<ChannelType>>, UserType>, sort?: ChannelSort, options?: ChannelOptions): Promise<Channel<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>[]>;
        /**
         * search - Query messages
         *
         * @param {ChannelFilters<Pick<ChannelType, KnownKeys<ChannelType>>, UserType>} filterConditions MongoDB style filter conditions
         * @param {MessageFilters<Pick<MessageType, KnownKeys<MessageType>>, AttachmentType, ReactionType, UserType> | string} query search query or object MongoDB style filters
         * @param {SearchOptions} [options] Option object, {user_id: 'tommaso'}
         *
         * @return {Promise<SearchAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>} search messages response
         */
        search(filterConditions: ChannelFilters<Pick<ChannelType, KnownKeys<ChannelType>>, UserType>, query: string | MessageFilters<Pick<MessageType, KnownKeys<MessageType>>, AttachmentType, ReactionType, UserType>, options?: SearchOptions): Promise<SearchAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        /**
         * addDevice - Adds a push device for a user.
         *
         * @param {string} id the device id
         * @param {'apn' | 'firebase'} push_provider the push provider (apn or firebase)
         * @param {string} [userID] the user id (defaults to current user)
         *
         */
        addDevice(id: string, push_provider: 'apn' | 'firebase', userID?: string): Promise<APIResponse>;
        /**
         * getDevices - Returns the devices associated with a current user
         *
         * @param {string} [userID] User ID. Only works on serversidex
         *
         * @return {APIResponse & Device<UserType>[]} Array of devices
         */
        getDevices(userID?: string): Promise<APIResponse & Device<UserType>[]>;
        /**
         * removeDevice - Removes the device with the given id. Clientside users can only delete their own devices
         *
         * @param {string} id The device id
         * @param {string} [userID] The user id. Only specify this for serverside requests
         *
         */
        removeDevice(id: string, userID?: string): Promise<APIResponse>;
        _addChannelConfig(channelState: ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>): void;
        /**
         * channel - Returns a new channel with the given type, id and custom data
         *
         * If you want to create a unique conversation between 2 or more users; you can leave out the ID parameter
         * and only provide ID and the list of members
         *
         * ie. client.channel("messaging", {members: ["tommaso", "thierry"]})
         *
         * @param {string} channelType The channel type
         * @param {string} channelID   The channel ID, you can leave this out if you want to create a conversation channel
         * @param {object} [custom]    Custom data to attach to the channel
         *
         * @return {channel} The channel object, initialize it using channel.watch()
         */
        channel(channelType: string, channelID: string, custom?: ChannelData<ChannelType>): Channel<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>;
        /**
         * @deprecated Please use upsertUser() function instead.
         *
         * updateUser - Update or Create the given user object
         *
         * @param {UserResponse<UserType>} userObject user object, the only required field is the user id. IE {id: "myuser"} is valid
         *
         * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>}
         */
        updateUser(userObject: UserResponse<UserType>): Promise<APIResponse & {
            users: {
                [key: string]: UserResponse<UserType>;
            };
        }>;
        /**
         * partialUpdateUser - Update the given user object
         *
         * @param {UserResponse<UserType>} userObject which should contain id and any of "set" or "unset" params;
         * example: {id: "user1", set:{field: value}, unset:["field2"]}
         *
         * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>} list of updated users
         */
        partialUpdateUser(userObject: UserResponse<UserType>): Promise<APIResponse & {
            users: {
                [key: string]: UserResponse<UserType>;
            };
        }>;
        /**
         * upsertUsers - Batch upsert the list of users
         *
         * @param {UserResponse<UserType>[]} users list of users
         *
         * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>}
         */
        upsertUsers(users: UserResponse<UserType>[]): Promise<APIResponse & {
            users: {
                [key: string]: UserResponse<UserType>;
            };
        }>;
        /**
         * upsertUser - Update or Create the given user object
         *
         * @param {UserResponse<UserType>} userObject user object, the only required field is the user id. IE {id: "myuser"} is valid
         *
         * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>}
         */
        upsertUser(userObject: UserResponse<UserType>): Promise<APIResponse & {
            users: {
                [key: string]: UserResponse<UserType>;
            };
        }>;
        /**
         * @deprecated Please use upsertUsers() function instead.
         *
         * updateUsers - Batch update the list of users
         *
         * @param {UserResponse<UserType>[]} users list of users
         *
         * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>}
         */
        updateUsers(users: UserResponse<UserType>[]): Promise<APIResponse & {
            users: {
                [key: string]: UserResponse<UserType>;
            };
        }>;
        /**
         * updateUsers - Batch partial update of users
         *
         * @param {UserResponse<UserType>[]} users list of partial update requests
         *
         * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>}
         */
        partialUpdateUsers(users: UserResponse<UserType>[]): Promise<APIResponse & {
            users: {
                [key: string]: UserResponse<UserType>;
            };
        }>;
        deleteUser(userID: string, params?: {
            hard_delete?: boolean;
            mark_messages_deleted?: boolean;
        }): Promise<APIResponse & {
            user: UserResponse<UserType>;
        }>;
        reactivateUser(userID: string, options?: {
            restore_messages?: boolean;
        }): Promise<APIResponse & {
            user: UserResponse<UserType>;
        }>;
        deactivateUser(userID: string, options?: {
            mark_messages_deleted?: boolean;
        }): Promise<APIResponse & {
            user: UserResponse<UserType>;
        }>;
        exportUser(userID: string, options?: Record<string, string>): Promise<APIResponse & {
            messages: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>[];
            reactions: ReactionResponse<ReactionType, UserType>[];
            user: UserResponse<UserType>;
        }>;
        /** banUser - bans a user from all channels
         *
         * @param {string} targetUserID
         * @param {BanUserOptions<UserType>} [options]
         * @returns {Promise<APIResponse>}
         */
        banUser(targetUserID: string, options?: BanUserOptions<UserType>): Promise<APIResponse>;
        /** unbanUser - revoke global ban for a user
         *
         * @param {string} targetUserID
         * @param {UnBanUserOptions} [options]
         * @returns {Promise<APIResponse>}
         */
        unbanUser(targetUserID: string, options?: UnBanUserOptions): Promise<APIResponse>;
        /** muteUser - mutes a user
         *
         * @param {string} targetID
         * @param {string} [userID] Only used with serverside auth
         * @returns {Promise<MuteUserResponse<UserType>>}
         */
        muteUser(targetID: string, userID?: string): Promise<MuteUserResponse<UserType>>;
        /** unmuteUser - unmutes a user
         *
         * @param {string} targetID
         * @param {string} [currentUserID] Only used with serverside auth
         * @returns {Promise<APIResponse>}
         */
        unmuteUser(targetID: string, currentUserID?: string): Promise<APIResponse>;
        flagMessage(targetMessageID: string, options?: FlagMessageOptions<UserType>): Promise<FlagMessageResponse<UserType>>;
        flagUser(userID: string, options?: FlagMessageOptions<UserType>): Promise<FlagMessageResponse<UserType>>;
        unflagMessage(messageID: string, options?: FlagMessageOptions<UserType>): Promise<FlagMessageResponse<UserType>>;
        unflagUser(userID: string, options?: FlagMessageOptions<UserType>): Promise<FlagMessageResponse<UserType>>;
        /**
         * markAllRead - marks all channels for this user as read
         * @param {MarkAllReadOptions<UserType>} [data]
         *
         * @return {Promise<APIResponse>}
         */
        markAllRead(data?: MarkAllReadOptions<UserType>): Promise<void>;
        createChannelType(data: CreateChannelOptions): Promise<Pick<GetChannelTypeResponse, "search" | "automod" | "automod_behavior" | "max_message_length" | "message_retention" | "mutes" | "name" | "permissions" | "reactions" | "read_events" | "replies" | "typing_events" | "uploads" | "url_enrichment" | "created_at" | "duration" | "updated_at">>;
        getChannelType(channelType: string): Promise<GetChannelTypeResponse>;
        updateChannelType(channelType: string, data: UpdateChannelOptions): Promise<UpdateChannelResponse>;
        deleteChannelType(channelType: string): Promise<APIResponse>;
        listChannelTypes(): Promise<ListChannelResponse>;
        /**
         * translateMessage - adds the translation to the message
         *
         * @param {string} messageId
         * @param {string} language
         *
         * @return {APIResponse & MessageResponse<MessageType, AttachmentType, ReactionType, UserType>} Response that includes the message
         */
        translateMessage(messageId: string, language: string): Promise<APIResponse & MessageType & {
            attachments?: import("src/types").Attachment<AttachmentType>[] | undefined;
            html?: string | undefined;
            id?: string | undefined;
            parent_id?: string | undefined;
            show_in_channel?: boolean | undefined;
            text?: string | undefined;
            user_id?: string | undefined;
        } & {
            command?: string | undefined;
            created_at?: string | undefined;
            deleted_at?: string | undefined;
            latest_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
            mentioned_users?: UserResponse<UserType>[] | undefined;
            own_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
            reaction_counts?: {
                [key: string]: number;
            } | undefined;
            reaction_scores?: {
                [key: string]: number;
            } | undefined;
            reply_count?: number | undefined;
            silent?: boolean | undefined;
            status?: string | undefined;
            type?: string | undefined;
            updated_at?: string | undefined;
            user?: UserResponse<UserType> | undefined;
        }>;
        /**
         * updateMessage - Update the given message
         *
         * @param {MessageResponse<MessageType, ReactionType, AttachmentType, UserType>} message object, id needs to be specified
         * @param {string | { id: string }} [userId]
         *
         * @return {APIResponse & { message: MessageResponse<MessageType, AttachmentType, ReactionType, UserType> }} Response that includes the message
         */
        updateMessage(message: MessageResponse<MessageType, ReactionType, AttachmentType, UserType>, userId?: string | {
            id: string;
        }): Promise<APIResponse & {
            message: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>;
        }>;
        deleteMessage(messageID: string, hardDelete?: boolean): Promise<APIResponse & {
            message: MessageResponse<MessageType, ReactionType, AttachmentType, UserType>;
        }>;
        getMessage(messageID: string): Promise<APIResponse & {
            message: MessageResponse<MessageType, ReactionType, AttachmentType, UserType>;
        }>;
        _userAgent(): string;
        /**
         * _isUsingServerAuth - Returns true if we're using server side auth
         */
        _isUsingServerAuth: () => boolean;
        _enrichAxiosOptions(options?: AxiosRequestConfig & {
            config?: AxiosRequestConfig;
        }): {
            params: any;
            headers: any;
        } | {
            url?: string | undefined;
            method?: string | undefined;
            baseURL?: string | undefined;
            transformRequest?: import("axios").AxiosTransformer | import("axios").AxiosTransformer[] | undefined;
            transformResponse?: import("axios").AxiosTransformer | import("axios").AxiosTransformer[] | undefined;
            headers: any;
            params: any;
            paramsSerializer?: ((params: any) => string) | undefined;
            data?: any;
            timeout?: number | undefined;
            withCredentials?: boolean | undefined;
            adapter?: import("axios").AxiosAdapter | undefined;
            auth?: import("axios").AxiosBasicCredentials | undefined;
            responseType?: string | undefined;
            xsrfCookieName?: string | undefined;
            xsrfHeaderName?: string | undefined;
            onUploadProgress?: ((progressEvent: any) => void) | undefined;
            onDownloadProgress?: ((progressEvent: any) => void) | undefined;
            maxContentLength?: number | undefined;
            validateStatus?: ((status: number) => boolean) | undefined;
            maxRedirects?: number | undefined;
            httpAgent?: any;
            httpsAgent?: any;
            proxy?: false | import("axios").AxiosProxyConfig | undefined;
            cancelToken?: import("axios").CancelToken | undefined;
        };
        _getToken(): string | null | undefined;
        _startCleaning(): void;
        verifyWebhook(requestBody: string, xSignature: string): boolean;
        /** getPermission - gets the definition for a permission
         *
         * @param {string} name
         * @returns {Promise<APIResponse>}
         */
        getPermission(name: string): Promise<APIResponse>;
        /** createPermission - creates a custom permission
         *
         * @param {CustomPermissionOptions} permissionData the permission data
         * @returns {Promise<APIResponse>}
         */
        createPermission(permissionData: CustomPermissionOptions): Promise<APIResponse>;
        /** updatePermission - updates an existing custom permission
         *
         * @param {string} name
         * @param {CustomPermissionOptions} permissionData the permission data
         * @returns {Promise<APIResponse>}
         */
        updatePermission(name: string, permissionData: CustomPermissionOptions): Promise<APIResponse>;
        /** deletePermission - deletes a custom permission
         *
         * @param {string} name
         * @returns {Promise<APIResponse>}
         */
        deletePermission(name: string): Promise<APIResponse>;
        /** listPermissions - returns the list of custom permissions for this application
         *
         * @returns {Promise<APIResponse>}
         */
        listPermissions(): Promise<APIResponse>;
        /** createRole - creates a custom role
         *
         * @param {string} name the new role name
         * @returns {Promise<APIResponse>}
         */
        createRole(name: string): Promise<APIResponse>;
        /** listRoles - returns the list of custom roles for this application
         *
         * @returns {Promise<APIResponse>}
         */
        listRoles(): Promise<APIResponse>;
        /** deleteRole - deletes a custom role
         *
         * @param {string} name the role name
         * @returns {Promise<APIResponse>}
         */
        deleteRole(name: string): Promise<APIResponse>;
        /** sync - returns all events that happened for a list of channels since last sync
         * @param {string[]} channel_cids list of channel CIDs
         * @param {string} last_sync_at last time the user was online and in sync. RFC3339 ie. "2020-05-06T15:05:01.207Z"
         */
        sync(channel_cids: string[], last_sync_at: string): Promise<APIResponse & {
            events: Event<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>[];
        }>;
    }
}
declare module "src/channel" {
    import Immutable from 'seamless-immutable';
    import { ChannelState } from "src/channel_state";
    import { StreamChat } from "src/client";
    import { APIResponse, ChannelAPIResponse, ChannelData, ChannelResponse, DeleteChannelAPIResponse, Event, EventHandler, EventTypes, GetMultipleMessagesAPIResponse, GetReactionsAPIResponse, GetRepliesAPIResponse, Message, MuteChannelAPIResponse, Reaction, ReactionAPIResponse, SearchAPIResponse, SendMessageAPIResponse, TruncateChannelAPIResponse, UpdateChannelAPIResponse, ChannelMemberAPIResponse, UserResponse, SendImageAPIResponse, UserSort, UserFilters, InviteOptions, MessageFilters, EventAPIResponse, MarkReadOptions, ChannelQueryOptions, PaginationOptions, BanUserOptions, KnownKeys } from "src/types";
    /**
     * Channel - The Channel class manages it's own state.
     */
    export class Channel<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType> {
        _client: StreamChat<UserType, MessageType, ChannelType, AttachmentType, ReactionType, EventType>;
        type: string;
        id: string | undefined;
        data: ChannelData<ChannelType> | ChannelResponse<ChannelType, UserType> | Immutable.Immutable<ChannelResponse<ChannelType, UserType>> | undefined;
        _data: ChannelData<ChannelType> | ChannelResponse<ChannelType, UserType>;
        cid: string;
        listeners: {
            [key: string]: (string | EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>)[];
        };
        state: ChannelState<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>;
        initialized: boolean;
        lastKeyStroke?: Date;
        lastTypingEvent: Date | null;
        isTyping: boolean;
        disconnected: boolean;
        /**
         * constructor - Create a channel
         *
         * @param {StreamChat<UserType, MessageType, ChannelType, AttachmentType, ReactionType, EventType>} client the chat client
         * @param {string} type  the type of channel
         * @param {string} [id]  the id of the chat
         * @param {ChannelData<ChannelType>} data any additional custom params
         *
         * @return {Channel<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>} Returns a new uninitialized channel
         */
        constructor(client: StreamChat<UserType, MessageType, ChannelType, AttachmentType, ReactionType, EventType>, type: string, id: string | undefined, data: ChannelData<ChannelType>);
        /**
         * getClient - Get the chat client for this channel. If client.disconnect() was called, this function will error
         *
         * @return {StreamChat<UserType, MessageType, ChannelType, AttachmentType, ReactionType, EventType>}
         */
        getClient(): StreamChat<UserType, MessageType, ChannelType, AttachmentType, ReactionType, EventType>;
        /**
         * getConfig - Get the configs for this channel type
         *
         * @return {Record<string, unknown>}
         */
        getConfig(): import("src/types").ChannelConfigWithInfo | undefined;
        /**
         * sendMessage - Send a message to this channel
         *
         * @param {Message<MessageType, AttachmentType, UserType>} message The Message object
         *
         * @return {Promise<SendMessageAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>} The Server Response
         */
        sendMessage(message: Message<MessageType, AttachmentType, UserType>): Promise<SendMessageAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        sendFile(uri: string | Buffer | File, name?: string, contentType?: string, user?: UserResponse<UserType>): Promise<SendImageAPIResponse>;
        sendImage(uri: string | Buffer | File, name?: string, contentType?: string, user?: UserResponse<UserType>): Promise<SendImageAPIResponse>;
        deleteFile(url: string): Promise<APIResponse>;
        deleteImage(url: string): Promise<APIResponse>;
        /**
         * sendEvent - Send an event on this channel
         *
         * @param {Event<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>} event for example {type: 'message.read'}
         *
         * @return {Promise<EventAPIResponse<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>>} The Server Response
         */
        sendEvent(event: Event<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>): Promise<EventAPIResponse<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>>;
        /**
         * search - Query messages
         *
         * @param { MessageFilters<Pick<MessageType, KnownKeys<MessageType>>, AttachmentType, ReactionType, UserType > | string}  query search query or object MongoDB style filters
         * @param {{client_id?: string; connection_id?: string; limit?: number; offset?: number; query?: string; message_filter_conditions?: MessageFilters<MessageType, AttachmentType, ReactionType, UserType>;}} options Option object, {user_id: 'tommaso'}
         *
         * @return {Promise<SearchAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>} search messages response
         */
        search(query: MessageFilters<Pick<MessageType, KnownKeys<MessageType>>, AttachmentType, ReactionType, UserType> | string, options: {
            client_id?: string;
            connection_id?: string;
            limit?: number;
            message_filter_conditions?: MessageFilters<Pick<MessageType, KnownKeys<MessageType>>, AttachmentType, ReactionType, UserType>;
            offset?: number;
            query?: string;
        }): Promise<SearchAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        /**
         * search - Query Members
         *
         * @param {UserFilters<Pick<UserType, KnownKeys<UserType>>>}  filterConditions object MongoDB style filters
         * @param {UserSort<UserType>} [sort] Sort options, for instance {created_at: -1}
         * @param {{ limit?: number; offset?: number }} [options] Option object, {limit: 10, offset:10}
         *
         * @return {Promise<ChannelMemberAPIResponse<UserType>>} search members response
         */
        queryMembers(filterConditions: UserFilters<Pick<UserType, KnownKeys<UserType>>>, sort?: UserSort<UserType>, options?: {
            limit?: number;
            offset?: number;
        }): Promise<ChannelMemberAPIResponse<UserType>>;
        /**
         * sendReaction - Send a reaction about a message
         *
         * @param {string} messageID the message id
         * @param {Reaction<ReactionType, UserType>} reaction the reaction object for instance {type: 'love'}
         * @param {string} user_id the id of the user (used only for server side request) default null
         *
         * @return {Promise<ReactionAPIResponse<ReactionType, AttachmentType, MessageType, UserType>>} The Server Response
         */
        sendReaction(messageID: string, reaction: Reaction<ReactionType, UserType>, user_id: string): Promise<ReactionAPIResponse<ReactionType, AttachmentType, MessageType, UserType>>;
        /**
         * deleteReaction - Delete a reaction by user and type
         *
         * @param {string} messageID the id of the message from which te remove the reaction
         * @param {string} reactionType the type of reaction that should be removed
         * @param {string} user_id the id of the user (used only for server side request) default null
         *
         * @return {Promise<ReactionAPIResponse<ReactionType, AttachmentType, MessageType, UserType>>} The Server Response
         */
        deleteReaction(messageID: string, reactionType: string, user_id: string): Promise<ReactionAPIResponse<ReactionType, AttachmentType, MessageType, UserType>>;
        /**
         * update - Edit the channel's custom properties
         *
         * @param {ChannelData<ChannelType>} channelData The object to update the custom properties of this channel with
         * @param {Message<MessageType, AttachmentType, UserType>} [updateMessage] Optional message object for channel members notification
         * @return {Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>} The server response
         */
        update(channelData: ChannelData<ChannelType>, updateMessage?: Message<MessageType, AttachmentType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * delete - Delete the channel. Messages are permanently removed.
         *
         * @return {Promise<DeleteChannelAPIResponse<ChannelType, UserType>>} The server response
         */
        delete(): Promise<DeleteChannelAPIResponse<ChannelType, UserType>>;
        /**
         * truncate - Removes all messages from the channel
         *
         * @return {Promise<TruncateChannelAPIResponse<ChannelType, UserType>>} The server response
         */
        truncate(): Promise<TruncateChannelAPIResponse<ChannelType, UserType>>;
        /**
         * acceptInvite - accept invitation to the channel
         *
         * @param {InviteOptions<AttachmentType, ChannelType, MessageType, ReactionType, UserType>} [options] The object to update the custom properties of this channel with
         *
         * @return {Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>} The server response
         */
        acceptInvite(options?: InviteOptions<AttachmentType, ChannelType, MessageType, ReactionType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * rejectInvite - reject invitation to the channel
         *
         * @param {InviteOptions<AttachmentType, ChannelType, MessageType, ReactionType, UserType>} [options] The object to update the custom properties of this channel with
         *
         * @return {Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>} The server response
         */
        rejectInvite(options?: InviteOptions<AttachmentType, ChannelType, MessageType, ReactionType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * addMembers - add members to the channel
         *
         * @param {string[]} members An array of member identifiers
         * @param {Message<MessageType, AttachmentType, UserType>} [message] Optional message object for channel members notification
         * @return {Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>} The server response
         */
        addMembers(members: string[], message?: Message<MessageType, AttachmentType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * addModerators - add moderators to the channel
         *
         * @param {string[]} members An array of member identifiers
         * @param {Message<MessageType, AttachmentType, UserType>} [message] Optional message object for channel members notification
         * @return {Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>} The server response
         */
        addModerators(members: string[], message?: Message<MessageType, AttachmentType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * inviteMembers - invite members to the channel
         *
         * @param {string[]} members An array of member identifiers
         * @param {Message<MessageType, AttachmentType, UserType>} [message] Optional message object for channel members notification
         * @return {Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>} The server response
         */
        inviteMembers(members: string[], message?: Message<MessageType, AttachmentType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * removeMembers - remove members from channel
         *
         * @param {string[]} members An array of member identifiers
         * @param {Message<MessageType, AttachmentType, UserType>} [message] Optional message object for channel members notification
         * @return {Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>} The server response
         */
        removeMembers(members: string[], message?: Message<MessageType, AttachmentType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * demoteModerators - remove moderator role from channel members
         *
         * @param {string[]} members An array of member identifiers
         * @param {Message<MessageType, AttachmentType, UserType>} [message] Optional message object for channel members notification
         * @return {Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>} The server response
         */
        demoteModerators(members: string[], message?: Message<MessageType, AttachmentType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * mute - mutes the current channel
         * @param {{ user_id?: string, expiration?: string }} opts expiration in minutes or user_id
         * @return {Promise<MuteChannelAPIResponse<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>>} The server response
         *
         * example with expiration:
         * await channel.mute({expiration: moment.duration(2, 'weeks')});
         *
         * example server side:
         * await channel.mute({user_id: userId});
         *
         */
        mute(opts?: {
            expiration?: number;
            user_id?: string;
        }): Promise<MuteChannelAPIResponse<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>>;
        /**
         * unmute - mutes the current channel
         * @param {{ user_id?: string}} opts user_id
         * @return {Promise<APIResponse>} The server response
         *
         * example server side:
         * await channel.unmute({user_id: userId});
         */
        unmute(opts?: {
            user_id?: string;
        }): Promise<APIResponse>;
        /**
         * muteStatus - returns the mute status for the current channel
         * @return {{ muted: boolean; createdAt?: string | null; expiredAt?: string | null }} { muted: true | false, createdAt: Date | null, expiresAt: Date | null}
         */
        muteStatus(): {
            muted: boolean;
            createdAt?: string | null;
            expiredAt?: string | null;
        };
        sendAction(messageID: string, formData: Record<string, string>): Promise<SendMessageAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        /**
         * keystroke - First of the typing.start and typing.stop events based on the users keystrokes.
         *  Call this on every keystroke
         */
        keystroke(): Promise<void>;
        /**
         * stopTyping - Sets last typing to null and sends the typing.stop event
         */
        stopTyping(): Promise<void>;
        /**
         * lastMessage - return the last message, takes into account that last few messages might not be perfectly sorted
         *
         * @return {Immutable.Immutable<ReturnType<ChannelState<AttachmentType, ChannelType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>> | undefined} Description
         */
        lastMessage(): Immutable.Immutable<Immutable.Immutable<MessageType & {
            attachments?: import("src/types").Attachment<AttachmentType>[] | undefined;
            html?: string | undefined;
            id?: string | undefined;
            parent_id?: string | undefined;
            show_in_channel?: boolean | undefined;
            text?: string | undefined;
            user_id?: string | undefined;
        } & {
            __html: string | undefined;
            created_at: Date;
            updated_at: Date;
            status: string;
            command?: string | undefined;
            deleted_at?: string | undefined;
            latest_reactions?: import("src/types").ReactionResponse<ReactionType, UserType>[] | undefined;
            mentioned_users?: UserResponse<UserType>[] | undefined;
            own_reactions?: import("src/types").ReactionResponse<ReactionType, UserType>[] | undefined;
            reaction_counts?: {
                [key: string]: number;
            } | undefined;
            reaction_scores?: {
                [key: string]: number;
            } | undefined;
            reply_count?: number | undefined;
            silent?: boolean | undefined;
            type?: string | undefined;
            user?: UserResponse<UserType> | undefined;
        }, {}>, {}> | undefined;
        /**
         * markRead - Send the mark read event for this user, only works if the `read_events` setting is enabled
         *
         * @param {MarkReadOptions<UserType>} data
         * @return {Promise<EventAPIResponse<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType> | null>} Description
         */
        markRead(data?: MarkReadOptions<UserType>): Promise<EventAPIResponse<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType> | null>;
        /**
         * clean - Cleans the channel state and fires stop typing if needed
         */
        clean(): void;
        /**
         * watch - Loads the initial channel state and watches for changes
         *
         * @param {ChannelQueryOptions<ChannelType, UserType>} options additional options for the query endpoint
         *
         * @return {Promise<ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>} The server response
         */
        watch(options: ChannelQueryOptions<ChannelType, UserType>): Promise<ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * stopWatching - Stops watching the channel
         *
         * @return {Promise<APIResponse>} The server response
         */
        stopWatching(): Promise<APIResponse>;
        /**
         * getReplies - List the message replies for a parent message
         *
         * @param {string} parent_id The message parent id, ie the top of the thread
         * @param {PaginationOptions & { user?: UserResponse<UserType>; user_id?: string }} options Pagination params, ie {limit:10, id_lte: 10}
         *
         * @return {Promise<GetRepliesAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>} A response with a list of messages
         */
        getReplies(parent_id: string, options: PaginationOptions & {
            user?: UserResponse<UserType>;
            user_id?: string;
        }): Promise<GetRepliesAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        /**
         * getReactions - List the reactions, supports pagination
         *
         * @param {string} message_id The message id
         * @param {{ limit?: number; offset?: number }} options The pagination options
         *
         * @return {Promise<GetReactionsAPIResponse<ReactionType, UserType>>} Server response
         */
        getReactions(message_id: string, options: {
            limit?: number;
            offset?: number;
        }): Promise<GetReactionsAPIResponse<ReactionType, UserType>>;
        /**
         * getMessagesById - Retrieves a list of messages by ID
         *
         * @param {string[]} messageIds The ids of the messages to retrieve from this channel
         *
         * @return {Promise<GetMultipleMessagesAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>} Server response
         */
        getMessagesById(messageIds: string[]): Promise<GetMultipleMessagesAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        /**
         * lastRead - returns the last time the user marked the channel as read if the user never marked the channel as read, this will return null
         * @return {Immutable.ImmutableDate | null | undefined}
         */
        lastRead(): Immutable.ImmutableDate | null | undefined;
        /**
         * countUnread - Count the number of messages with a date thats newer than the last read timestamp
         *
         * @param {Date | Immutable.ImmutableDate | null} [lastRead] lastRead the time that the user read a message, defaults to current user's read state
         *
         * @return {number} Unread count
         */
        countUnread(lastRead?: Date | Immutable.ImmutableDate | null): number;
        /**
         * countUnread - Count the number of unread messages mentioning the current user
         *
         * @return {number} Unread mentions count
         */
        countUnreadMentions(): number;
        /**
         * create - Creates a new channel
         *
         * @return {Promise<ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>} The Server Response
         */
        create: () => Promise<ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * query - Query the API, get messages, members or other channel fields
         *
         * @param {ChannelQueryOptions<ChannelType, UserType>} options The query options
         *
         * @return {Promise<ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>} Returns a query response
         */
        query(options: ChannelQueryOptions<ChannelType, UserType>): Promise<ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * banUser - Bans a user from a channel
         *
         * @param {string} targetUserID
         * @param {BanUserOptions<UserType>} options
         * @returns {Promise<APIResponse>}
         */
        banUser(targetUserID: string, options: BanUserOptions<UserType>): Promise<APIResponse>;
        /**
         * hides the channel from queryChannels for the user until a message is added
         * If clearHistory is set to true - all messages will be removed for the user
         *
         * @param {string | null} userId
         * @param {boolean} clearHistory
         * @returns {Promise<APIResponse>}
         */
        hide(userId?: string | null, clearHistory?: boolean): Promise<APIResponse>;
        /**
         * removes the hidden status for a channel
         *
         * @param {string | null} userId
         * @returns {Promise<APIResponse>}
         */
        show(userId?: string | null): Promise<APIResponse>;
        /**
         * unbanUser - Removes the bans for a user on a channel
         *
         * @param {string} targetUserID
         * @returns {Promise<APIResponse>}
         */
        unbanUser(targetUserID: string): Promise<APIResponse>;
        /**
         * on - Listen to events on this channel.
         *
         * channel.on('message.new', event => {console.log("my new message", event, channel.state.messages)})
         * or
         * channel.on(event => {console.log(event.type)})
         *
         * @param {EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType> | EventTypes} callbackOrString  The event type to listen for (optional)
         * @param {EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>} [callbackOrNothing] The callback to call
         */
        on(eventType: EventTypes, callback: EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>): void;
        on(callback: EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>): void;
        /**
         * off - Remove the event handler
         *
         */
        off(eventType: EventTypes, callback: EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>): void;
        off(callback: EventHandler<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>): void;
        _handleChannelEvent(event: Event<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>): void;
        _callChannelListeners: (event: Event<EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>) => void;
        /**
         * _channelURL - Returns the channel url
         *
         * @return {string} The channel url
         */
        _channelURL: () => string;
        _checkInitialized(): void;
        _initializeState(state: ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>): void;
        _disconnect(): void;
    }
}
declare module "src/permissions" {
    import { PermissionObject } from "src/types";
    type RequiredPermissionObject = Required<PermissionObject>;
    export const Allow = "Allow";
    export const Deny = "Deny";
    export const AnyResource: string[];
    export const AnyRole: string[];
    export const MaxPriority = 999;
    export const MinPriority = 1;
    export class Permission {
        name: RequiredPermissionObject['name'];
        action: RequiredPermissionObject['action'];
        owner: RequiredPermissionObject['owner'];
        priority: RequiredPermissionObject['priority'];
        resources: RequiredPermissionObject['resources'];
        roles: RequiredPermissionObject['roles'];
        constructor(name: string, priority: number, resources?: string[], roles?: string[], owner?: boolean, action?: RequiredPermissionObject['action']);
    }
    export const AllowAll: Permission;
    export const DenyAll: Permission;
    export const BuiltinRoles: {
        Anonymous: string;
        Guest: string;
        User: string;
        Admin: string;
        ChannelModerator: string;
        ChannelMember: string;
    };
    export const BuiltinPermissions: {
        CreateMessage: string;
        UpdateAnyMessage: string;
        UpdateOwnMessage: string;
        DeleteAnyMessage: string;
        DeleteOwnMessage: string;
        CreateChannel: string;
        ReadAnyChannel: string;
        ReadOwnChannel: string;
        UpdateMembersAnyChannel: string;
        UpdateMembersOwnChannel: string;
        UpdateAnyChannel: string;
        UpdateOwnChannel: string;
        DeleteAnyChannel: string;
        DeleteOwnChannel: string;
        RunMessageAction: string;
        BanUser: string;
        UploadAttachment: string;
        DeleteAnyAttachment: string;
        DeleteOwnAttachment: string;
        AddLinks: string;
        CreateReaction: string;
        DeleteAnyReaction: string;
        DeleteOwnReaction: string;
    };
}
declare module "src/index" {
    export * from "src/base64";
    export { StreamChat } from "src/client";
    export * from "src/client_state";
    export * from "src/channel";
    export * from "src/channel_state";
    export * from "src/connection";
    export * from "src/events";
    export * from "src/permissions";
    export * from "src/signing";
    export * from "src/token_manager";
    export * from "src/types";
    export { logChatPromiseExecution } from "src/utils";
}
//# sourceMappingURL=index.d.ts.map