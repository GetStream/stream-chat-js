import { generateMsg } from './generateMessage';

export const generatePendingTask = (type, id = 1, options = {}, payloadOptions = {}) => {
	const payloadObject = generatePendingTaskPayload(type, payloadOptions);
	return {
		channelId: 'channel123',
		channelType: 'messaging',
		messageId: '123',
		id,
		...payloadObject,
		...options,
	};
};

export const generatePendingTaskPayload = (type, options = {}) => {
	if (type === 'send-reaction') {
		const messageId = options.messageId ?? '123';
		const reaction = options.reaction ?? { type: 'wow', message_id: messageId };
		return { type, payload: [messageId, reaction] };
	}

	if (type === 'delete-reaction') {
		const messageId = options.messageId ?? '123';
		const reactionType = options.reactionType ?? 'wow';
		return { type, payload: [messageId, reactionType] };
	}

	if (type === 'delete-message') {
		const messageId = options.messageId ?? '123';
		return { type, payload: [messageId] };
	}

	const message = options.message ?? generateMsg();
	return { type, payload: [message] };
};
