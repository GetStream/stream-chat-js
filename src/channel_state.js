import Immutable from 'seamless-immutable';

/**
 * ChannelState - A container class for the channel state.
 */

function byDate(a, b) {
	return a.created_at - b.created_at;
}

export class ChannelState {
	constructor(channel) {
		this._channel = channel;
		this.watcher_count = 0;
		this.typing = Immutable({});
		this.read = Immutable({});
		this.messages = Immutable([]);
		this.threads = Immutable({});
		// a list of users to hide messages from
		this.mutedUsers = Immutable([]);
		this.watchers = Immutable({});
		this.members = Immutable({});
	}

	/**
	 * addMessageSorted - Add a message to the state
	 *
	 * @param {object} newMessage A new message
	 *
	 */
	addMessageSorted(newMessage) {
		return this.addMessagesSorted([newMessage]);
	}

	/**
	 * messageToImmutable - Takes the message object. Parses the dates, sets __html
	 * and sets the status to received if missing. Returns an immutable message object
	 *
	 * @param {object} message an Immutable message object
	 *
	 */
	messageToImmutable(message) {
		message.__html = message.html;
		// parse the date..
		message.created_at = new Date(message.created_at);
		message.updated_at = new Date(message.updated_at);
		if (!message.status) {
			message.status = 'received';
		}
		return Immutable(message);
	}

	/**
	 * addMessagesSorted - Add the list of messages to state and resorts the messages
	 *
	 * @param {array} newMessages A list of messages
	 *
	 */
	addMessagesSorted(newMessages) {
		// parse all the new message dates and add __html for react
		const parsedMessages = [];
		for (const message of newMessages) {
			parsedMessages.push(this.messageToImmutable(message));
		}

		// update or append the messages...
		const updatedThreads = [];
		for (const message of parsedMessages) {
			const isThreadReply = message.parent_id && !message.show_in_channel;
			// add to the main message list
			if (!isThreadReply) {
				this.messages = this._addToMessageList(this.messages, message);
			}
			// add to the thread if applicable..
			const parentID = message.parent_id;
			if (parentID) {
				const thread = this.threads[parentID] || Immutable([]);
				const threadMessages = this._addToMessageList(thread, message);
				this.threads = this.threads.set(parentID, threadMessages);
				updatedThreads.push(parentID);
			}
		}

		// Resort the main messages and the threads that changed...
		const messages = [...this.messages];
		messages.sort(byDate);
		this.messages = Immutable(messages);
		for (const parentID of updatedThreads) {
			const threadMessages = this.threads[parentID]
				? [...this.threads[parentID]]
				: [];
			threadMessages.sort(byDate);
			this.threads = this.threads.set(parentID, threadMessages);
		}
	}

	addReaction(reaction, message) {
		const { messages } = this;
		if (!message) return;
		const { parent_id, show_in_channel } = message;

		if (parent_id) {
			const thread = this.threads[parent_id];

			for (let i = 0; i < thread.length; i++) {
				let message = thread[i];
				message = this._addReactionToMessage(message, reaction);
				if (!message) {
					continue;
				}
				this.threads = this.threads.set(parent_id, thread.set(i, message));
				break;
			}
		}

		if ((!show_in_channel && !parent_id) || show_in_channel) {
			for (let i = 0; i < messages.length; i++) {
				let message = messages[i];
				message = this._addReactionToMessage(message, reaction);
				if (!message) {
					continue;
				}
				this.messages = messages.set(i, message);
				break;
			}
		}
	}

	_addReactionToMessage(message, reaction) {
		const idMatch = message.id && message.id === reaction.message_id;

		if (!idMatch) {
			return false;
		}

		message = this._removeReactionFromMessage(message, reaction);
		if (this._channel.getClient().userID === reaction.user.id) {
			message = message.update('own_reactions', (old = []) =>
				old.concat([reaction]),
			);
		}
		message = message.update('latest_reactions', (old = []) =>
			old.concat([reaction]),
		);

		message = message.updateIn(['reaction_counts', reaction.type], old =>
			old ? old + 1 : 1,
		);

		return message;
	}

	_removeReactionFromMessage(message, reaction) {
		const filterReaction = old =>
			old.filter(
				item => item.type !== reaction.type || item.user.id !== reaction.user.id,
			);
		message = message.update('own_reactions', filterReaction);
		message = message.update('latest_reactions', filterReaction);
		return message;
	}

	removeReaction(reaction, message) {
		const { messages } = this;
		if (!message) return;
		const { parent_id, show_in_channel } = message;

		if (parent_id) {
			const thread = this.threads[parent_id];
			for (let i = 0; i < thread.length; i++) {
				let message = thread[i];
				const idMatch = message.id && message.id === reaction.message_id;

				if (!idMatch) {
					continue;
				}
				message = this._removeReactionFromMessage(message, reaction);
				message = message.updateIn(['reaction_counts', reaction.type], old =>
					old ? old - 1 : 0,
				);

				this.threads = this.threads.set(parent_id, thread.set(i, message));
				break;
			}
		}
		if ((!show_in_channel && !parent_id) || show_in_channel) {
			for (let i = 0; i < messages.length; i++) {
				let message = messages[i];
				const idMatch = message.id && message.id === reaction.message_id;

				if (!idMatch) {
					continue;
				}
				message = this._removeReactionFromMessage(message, reaction);
				message = message.updateIn(['reaction_counts', reaction.type], old =>
					old ? old - 1 : 0,
				);

				this.messages = messages.set(i, message);
				break;
			}
		}
	}

	/**
	 * _addToMessageList - Adds a message to a list of messages, tries to update first, appends if message isnt found
	 *
	 * @param {array} messages A list of messages
	 * @param {object} newMessage The new message
	 *
	 */
	_addToMessageList(messages, newMessage) {
		let updated = false;

		for (let i = 0; i < messages.length; i++) {
			const message = messages[i];
			const idMatch = message.id && newMessage.id && message.id === newMessage.id;

			if (idMatch) {
				messages = messages.set(i, newMessage);
				updated = true;
			}
		}

		if (!updated) {
			messages = messages.concat([newMessage]);
		}

		return messages;
	}

	/**
	 * removeMessage - Description
	 *
	 * @param {type} messageToRemove Object of the message to remove. Needs to have at id specified.
	 *
	 * @return {boolean} Returns if the message was removed
	 */
	removeMessage(messageToRemove) {
		let removed = false;
		const messages = this.messages.flatMap(message => {
			const idMatch =
				message.id && messageToRemove.id && message.id === messageToRemove.id;

			if (idMatch) {
				return [];
			} else {
				removed = true;
				return message;
			}
		});

		this.messages = messages;
		return removed;
	}

	/**
	 * filterErrorMessages - Removes error messages from the channel state.
	 *
	 */
	filterErrorMessages() {
		const filteredMessages = this.messages.flatMap(message => {
			if (message.type !== 'error') {
				return message;
			} else {
				return [];
			}
		});

		this.messages = Immutable(filteredMessages);
	}

	/**
	 * clean - Remove stale data such as users that stayed in typing state for more than 5 seconds
	 */
	clean() {
		const now = new Date();

		// prevent old users from showing up as typing
		for (const [userID, lastEvent] of Object.entries(this.typing)) {
			const since = now - new Date(lastEvent.received_at);
			if (since > 7000) {
				this.typing = this.typing.without(userID);
				this._channel.client.dispatchEvent({
					type: 'typing.stop',
					user: { id: userID },
					cid: this._channel.cid,
				});
			}
		}
	}
}
