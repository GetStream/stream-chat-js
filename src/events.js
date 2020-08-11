export const EVENT_MAP = {
	'user.presence.changed': true,
	'user.watching.start': true,
	'user.watching.stop': true,
	'user.updated': true,
	'user.deleted': true,
	'typing.start': true,
	'typing.stop': true,
	'message.new': true,
	'message.updated': true,
	'message.deleted': true,
	'message.read': true,
	'reaction.new': true,
	'reaction.deleted': true,
	'member.added': true,
	'member.updated': true,
	'member.removed': true,
	'channel.updated': true,
	'channel.muted': true,
	'channel.unmuted': true,
	'channel.deleted': true,
	'channel.truncated': true,
	'channel.created': true,
	'channel.hidden': true,
	'channel.visible': true,
	'health.check': true,
	'notification.message_new': true,
	'notification.mark_read': true,
	'notification.invited': true,
	'notification.invite_accepted': true,
	'notification.added_to_channel': true,
	'notification.removed_from_channel': true,
	'notification.mutes_updated': true,
	'notification.channel_deleted': true,
	'notification.channel_truncated': true,
	'notification.channel_mutes_updated': true,
	// local events
	'connection.changed': true,
	'connection.recovered': true,
};

export function isValidEventType(eventType) {
	if (eventType === 'all') {
		return true;
	}
	return EVENT_MAP[eventType] || false;
}
