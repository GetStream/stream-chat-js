export const Allow = 'Allow';
export const Deny = 'Deny';
export const AnyResource = ['*'];
export const AnyRole = ['*'];
export const MaxPriority = 999;
export const MinPriority = 1;

export class Permission {
	constructor(
		name,
		priority,
		resources = AnyResource,
		roles = AnyRole,
		owner = false,
		action = Allow,
	) {
		this.name = name;
		this.action = action;
		this.owner = owner;
		this.priority = priority;
		this.resources = resources;
		this.roles = roles;
	}
}

export const AllowAll = new Permission(
	'Allow all',
	MaxPriority,
	AnyResource,
	AnyRole,
	false,
	Allow,
);
export const DenyAll = new Permission(
	'Deny all',
	MinPriority,
	AnyResource,
	AnyRole,
	false,
	Deny,
);
