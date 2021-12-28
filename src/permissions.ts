/*
 * RoleName can have any custom string value depending on application configuration. Please do not check role value directly
 * and consider using channel capabilities to detect available features
 */
export type RoleName = string;

export type Role = {
  created_at: string;
  custom: boolean;
  name: RoleName;
  scopes: string[];
  updated_at: string;
};

export type Permission = {
  action?: string;
  condition?: object;
  custom?: boolean;
  description?: string;
  id?: string;
  level?: string;
  name?: string;
  owner?: boolean;
  same_team?: boolean;
};

/*
 * Policies are entities for permissions v1. They are deprecated and will be removed in the future release
 */
export class Policy {
  action?: 'Deny' | 'Allow';
  created_at?: string;
  name?: string;
  owner?: boolean;
  priority?: number;
  resources?: string[];
  roles?: string[];
  updated_at?: string;
  constructor(
    name: string,
    priority: number,
    resources = AnyResource,
    roles = AnyRole,
    owner = false,
    action: RequiredPolicyObject['action'] = Allow,
  ) {
    this.name = name;
    this.action = action;
    this.owner = owner;
    this.priority = priority;
    this.resources = resources;
    this.roles = roles;
  }
}

type RequiredPolicyObject = Required<Policy>;

export const Allow = 'Allow';
export const Deny = 'Deny';
export const AnyResource = ['*'];
export const AnyRole = ['*'];
export const MaxPriority = 999;
export const MinPriority = 1;

// deprecated
export const AllowAll = new Policy('Allow all', MaxPriority, AnyResource, AnyRole, false, Allow);

// deprecated
export const DenyAll = new Policy('Deny all', MinPriority, AnyResource, AnyRole, false, Deny);
