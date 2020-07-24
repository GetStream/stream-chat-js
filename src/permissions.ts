import { PermissionObject } from './types';

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

export const BuiltinRoles = {
  Anonymous: 'anonymous',
  Guest: 'guest',
  User: 'user',
  Admin: 'admin',
  ChannelModerator: 'channel_moderator',
  ChannelMember: 'channel_member',
};

export const BuiltinPermissions = {
  CreateMessage: 'Create Message',
  UpdateAnyMessage: 'Update Any Message',
  UpdateOwnMessage: 'Update Own Message',
  DeleteAnyMessage: 'Delete Any Message',
  DeleteOwnMessage: 'Delete Own Message',
  CreateChannel: 'Create Channel',
  ReadAnyChannel: 'Read Any Channel',
  ReadOwnChannel: 'Read Own Channel',
  UpdateMembersAnyChannel: 'Update Members Any Channel',
  UpdateMembersOwnChannel: 'Update Members Own Channel',
  UpdateAnyChannel: 'Update Any Channel',
  UpdateOwnChannel: 'Update Own Channel',
  DeleteAnyChannel: 'Delete Any Channel',
  DeleteOwnChannel: 'Delete Own Channel',
  RunMessageAction: 'Run Message Action',
  BanUser: 'Ban User',
  UploadAttachment: 'Upload Attachment',
  DeleteAnyAttachment: 'Delete Any Attachment',
  DeleteOwnAttachment: 'Delete Own Attachment',
  AddLinks: 'Add Links',
  CreateReaction: 'Create Reaction',
  DeleteAnyReaction: 'Delete Any Reaction',
  DeleteOwnReaction: 'Delete Own Reaction',
};
