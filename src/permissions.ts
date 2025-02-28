import type { PermissionObject } from './types';

type RequiredPermissionObject = Required<PermissionObject>;

export const Allow = 'Allow';
export const Deny = 'Deny';
export const AnyResource = ['*'];
export const AnyRole = ['*'];
export const MaxPriority = 999;
export const MinPriority = 1;

// deprecated permission object class, you should use the new permission system v2 and use permissions
// defined in BuiltinPermissions to configure your channel types

export class Permission {
  name: RequiredPermissionObject['name'];
  action: RequiredPermissionObject['action'];
  owner: RequiredPermissionObject['owner'];
  priority: RequiredPermissionObject['priority'];
  resources: RequiredPermissionObject['resources'];
  roles: RequiredPermissionObject['roles'];
  constructor(
    name: string,
    priority: number,
    resources = AnyResource,
    roles = AnyRole,
    owner = false,
    action: RequiredPermissionObject['action'] = Allow,
  ) {
    this.name = name;
    this.action = action;
    this.owner = owner;
    this.priority = priority;
    this.resources = resources;
    this.roles = roles;
  }
}

// deprecated
export const AllowAll = new Permission(
  'Allow all',
  MaxPriority,
  AnyResource,
  AnyRole,
  false,
  Allow,
);

// deprecated
export const DenyAll = new Permission(
  'Deny all',
  MinPriority,
  AnyResource,
  AnyRole,
  false,
  Deny,
);

export type Role =
  | 'admin'
  | 'user'
  | 'guest'
  | 'anonymous'
  | 'channel_member'
  | 'channel_moderator'
  | (string & {});

export const BuiltinRoles = {
  Admin: 'admin',
  Anonymous: 'anonymous',
  ChannelMember: 'channel_member',
  ChannelModerator: 'channel_moderator',
  Guest: 'guest',
  User: 'user',
};

export const BuiltinPermissions = {
  AddLinks: 'Add Links',
  BanUser: 'Ban User',
  CreateChannel: 'Create Channel',
  CreateMessage: 'Create Message',
  CreateReaction: 'Create Reaction',
  DeleteAnyAttachment: 'Delete Any Attachment',
  DeleteAnyChannel: 'Delete Any Channel',
  DeleteAnyMessage: 'Delete Any Message',
  DeleteAnyReaction: 'Delete Any Reaction',
  DeleteOwnAttachment: 'Delete Own Attachment',
  DeleteOwnChannel: 'Delete Own Channel',
  DeleteOwnMessage: 'Delete Own Message',
  DeleteOwnReaction: 'Delete Own Reaction',
  ReadAnyChannel: 'Read Any Channel',
  ReadOwnChannel: 'Read Own Channel',
  RunMessageAction: 'Run Message Action',
  UpdateAnyChannel: 'Update Any Channel',
  UpdateAnyMessage: 'Update Any Message',
  UpdateMembersAnyChannel: 'Update Members Any Channel',
  UpdateMembersOwnChannel: 'Update Members Own Channel',
  UpdateOwnChannel: 'Update Own Channel',
  UpdateOwnMessage: 'Update Own Message',
  UploadAttachment: 'Upload Attachment',
  UseFrozenChannel: 'Send messages and reactions to frozen channels',
};
