import Immutable from 'seamless-immutable';
import { ChannelState } from './channel_state';
import { isValidEventType } from './events';
import { logChatPromiseExecution } from './utils';

/**
 * Channel - The Channel class manages it's own state.
 */
export class Channel {
	/**
	 * constructor - Create a channel
	 *
	 * @param {Client} client the chat client
	 * @param {string} type  the type of channel
	 * @param {string} [id]  the id of the chat
	 * @param {type} custom any additional custom params
	 *
	 * @return {Channel} Returns a new uninitialized channel
	 */
	constructor(client, type, id, data) {
		const validTypeRe = /^[\w_-]+$/;
		const validIDRe = /^[\w!_-]+$/;

		if (!validTypeRe.test(type)) {
			throw new Error(
				`Invalid chat type ${type}, letters, numbers and "_-" are allowed`,
			);
		}
		if (!validIDRe.test(id)) {
			throw new Error(
				`Invalid chat id ${id}, letters, numbers and "!-_" are allowed`,
			);
		}

		this._client = client;
		this.type = type;
		this.id = id;
		// used by the frontend, gets updated:
		this.data = data;
		// this._data is used for the requests...
		this._data = { ...data };

		this.cid = `${type}:${id}`;
		this.listeners = {};
		// perhaps the state variable should be private
		this.state = new ChannelState(this);
		this.initialized = false;
		this.lastTypingEvent = null;
		this.isTyping = false;
		this.disconnected = false;
	}

	/**
	 * getClient - Get the chat client for this channel. If client.disconnect() was called, this function will error
	 *
	 * @return {object}
	 */
	getClient() {
		if (this.disconnected === true) {
			throw Error(`You can't use a channel after client.disconnect() was called`);
		}
		return this._client;
	}

	/**
	 * getConfig - Get the configs for this channel type
	 *
	 * @return {object}
	 */
	getConfig() {
		const client = this.getClient();
		return client.configs[this.type];
	}

	/**
	 * sendMessage - Send a message to this channel
	 *
	 * @param {object} message The Message object
	 *
	 * @return {object} The Server Response
	 */

	async sendMessage(message) {
		return await this.getClient().post(this._channelURL() + '/message', {
			message,
		});
	}

	sendFile(uri, name, contentType, user) {
		return this.getClient().sendFile(
			`${this._channelURL()}/file`,
			uri,
			name,
			contentType,
			user,
		);
	}

	sendImage(uri, name, contentType, user) {
		return this.getClient().sendFile(
			`${this._channelURL()}/image`,
			uri,
			name,
			contentType,
			user,
		);
	}

	deleteFile(url) {
		return this.getClient().delete(`${this._channelURL()}/file`, { url });
	}

	deleteImage(url) {
		return this.getClient().delete(`${this._channelURL()}/image`, { url });
	}

	/**
	 * sendEvent - Send an event on this channel
	 *
	 * @param {object} event for example {type: 'message.read'}
	 *
	 * @return {object} The Server Response
	 */
	async sendEvent(event) {
		this._checkInitialized();
		return await this.getClient().post(this._channelURL() + '/event', {
			event,
		});
	}

	/**
	 * sendReaction - Send a reaction about a message
	 *
	 * @param {string} messageID the message id
	 * @param {object} reaction the reaction object for instance {type: 'love'}
	 * @param {string} user_id the id of the user (used only for server side request) default null
	 *
	 * @return {object} The Server Response
	 */
	async sendReaction(messageID, reaction, user_id) {
		if (!messageID) {
			throw Error(`Message id is missing`);
		}
		if (!reaction || Object.keys(reaction).length === 0) {
			throw Error(`Reaction object is missing`);
		}
		const body = {
			reaction,
		};
		if (user_id != null) {
			body.reaction = { ...reaction, user: { id: user_id } };
		}
		return await this.getClient().post(
			this.getClient().baseURL + `/messages/${messageID}/reaction`,
			body,
		);
	}

	/**
	 * deleteReaction - Delete a reaction by user and type
	 *
	 * @param {string} messageID the id of the message from which te remove the reaction
	 * @param {string} reactionType the type of reaction that should be removed
	 * @param {string} user_id the id of the user (used only for server side request) default null
	 *
	 * @return {object} The Server Response
	 */
	deleteReaction(messageID, reactionType, user_id) {
		this._checkInitialized();
		if (!reactionType || !messageID) {
			throw Error(
				'Deleting a reaction requires specifying both the message and reaction type',
			);
		}

		const url =
			this.getClient().baseURL + `/messages/${messageID}/reaction/${reactionType}`;
		//provided when server side request
		if (user_id) {
			return this.getClient().delete(url, { user_id });
		}

		return this.getClient().delete(url);
	}

	/**
	 * update - Edit the channel's custom properties
	 *
	 * @param {object} channelData The object to update the custom properties of this channel with
	 * @param {object} updateMessage Optional message object for channel members notification
	 * @return {type} The server response
	 */
	async update(channelData, updateMessage) {
		const data = await this.getClient().post(this._channelURL(), {
			message: updateMessage,
			data: channelData,
		});
		this.data = data.channel;
		return data;
	}

	/**
	 * delete - Delete the channel. Messages are permanently removed.
	 *
	 * @return {object} The server response
	 */
	async delete() {
		return await this.getClient().delete(this._channelURL());
	}

	/**
	 * truncate - Removes all messages from the channel
	 *
	 * @return {object} The server response
	 */
	async truncate() {
		return await this.getClient().post(this._channelURL() + '/truncate');
	}

	/**
	 * acceptInvite - accept invitation to the channel
	 *
	 * @param {object} options The object to update the custom properties of this channel with
	 *
	 * @return {type} The server response
	 */
	async acceptInvite(options = {}) {
		const data = await this.getClient().post(this._channelURL(), {
			accept_invite: true,
			...options,
		});
		this.data = data.channel;
		return data;
	}

	/**
	 * acceptInvite - reject invitation to the channel
	 *
	 * @param {object} options The object to update the custom properties of this channel with
	 *
	 * @return {type} The server response
	 */
	async rejectInvite(options = {}) {
		const data = await this.getClient().post(this._channelURL(), {
			reject_invite: true,
			...options,
		});
		this.data = data.channel;
		return data;
	}

	/**
	 * addMembers - add members to the channel
	 *
	 * @param {array} members An array of member identifiers
	 * @param {object} message Optional message object for channel members notification
	 * @return {type} The server response
	 */
	async addMembers(members, message) {
		const data = await this.getClient().post(this._channelURL(), {
			add_members: members,
			message,
		});
		this.data = data.channel;
		return data;
	}

	/**
	 * addModerators - add moderators to the channel
	 *
	 * @param {array} members An array of member identifiers
	 * @param {object} message Optional message object for channel members notification
	 * @return {type} The server response
	 */
	async addModerators(members, message) {
		const data = await this.getClient().post(this._channelURL(), {
			add_moderators: members,
			message,
		});
		this.data = data.channel;
		return data;
	}

	/**
	 * inviteMembers - invite members to the channel
	 *
	 * @param {array} members An array of member identifiers
	 * @param {object} message Optional message object for channel members notification
	 * @return {type} The server response
	 */
	async inviteMembers(members, message) {
		const data = await this.getClient().post(this._channelURL(), {
			invites: members,
			message,
		});
		this.data = data.channel;
		return data;
	}

	/**
	 * removeMembers - remove members from channel
	 *
	 * @param {array} members An array of member identifiers
	 * @param {object} message Optional message object for channel members notification
	 * @return {type} The server response
	 */
	async removeMembers(members, message) {
		const data = await this.getClient().post(this._channelURL(), {
			remove_members: members,
			message,
		});
		this.data = data.channel;
		return data;
	}

	/**
	 * demoteModerators - remove moderator role from channel members
	 *
	 * @param {array} members An array of member identifiers
	 * @param {object} message Optional message object for channel members notification
	 * @return {type} The server response
	 */
	async demoteModerators(members, message) {
		const data = await this.getClient().post(this._channelURL(), {
			demote_moderators: members,
			message,
		});
		this.data = data.channel;
		return data;
	}

	sendAction(messageID, formData) {
		this._checkInitialized();
		if (!messageID) {
			throw Error(`Message id is missing`);
		}
		return this.getClient().post(
			this.getClient().baseURL + `/messages/${messageID}/action`,
			{
				message_id: messageID,
				form_data: formData,
				id: this.id,
				type: this.type,
			},
		);
	}

	/**
	 * keystroke - First of the typing.start and typing.stop events based on the users keystrokes.
	 *  Call this on every keystroke
	 */
	async keystroke() {
		if (!this.getConfig().typing_events) {
			return;
		}
		const now = new Date();
		const diff = now - this.lastTypingEvent;
		this.lastKeyStroke = now;
		this.isTyping = true;
		// send a typing.start every 2 seconds
		if (diff > 2000) {
			this.lastTypingEvent = new Date();
			await this.sendEvent({
				type: 'typing.start',
			});
		}
	}

	/**
	 * stopTyping - Sets last typing to null and sends the typing.stop event
	 */
	async stopTyping() {
		if (!this.getConfig().typing_events) {
			return;
		}
		this.lastTypingEvent = null;
		this.isTyping = false;
		await this.sendEvent({
			type: 'typing.stop',
		});
	}

	/**
	 * lastMessage - return the last message, takes into account that last few messages might not be perfectly sorted
	 *
	 * @return {type} Description
	 */
	lastMessage() {
		// get last 5 messages, sort, return the latest
		// get a slice of the last 5
		let min = this.state.messages.length - 5;
		if (min < 0) {
			min = 0;
		}
		const max = this.state.messages.length + 1;
		const messageSlice = this.state.messages.slice(min, max).asMutable();

		// sort by pk desc
		messageSlice.sort((a, b) => b.created_at - a.created_at);

		let lastMessage;
		if (messageSlice.length > 0) {
			lastMessage = messageSlice[0];
		}
		return lastMessage;
	}

	/**
	 * markRead - Send the mark read event for this user, only works if the `read_events` setting is enabled
	 *
	 * @return {Promise} Description
	 */
	async markRead(data = {}) {
		this._checkInitialized();

		if (!this.getConfig().read_events) {
			return Promise.resolve(null);
		}

		return await this.getClient().post(this._channelURL() + '/read', {
			...data,
		});
	}

	/**
	 * clean - Cleans the channel state and fires stop typing if needed
	 */
	clean() {
		if (this.lastKeyStroke) {
			const now = new Date();
			const diff = now - this.lastKeyStroke;
			if (diff > 1000 && this.isTyping) {
				logChatPromiseExecution(this.stopTyping(), 'stop typing event');
			}
		}

		this.state.clean();
	}

	/**
	 * watch - Loads the initial channel state and watches for changes
	 *
	 * @param {object} options additional options for the query endpoint
	 *
	 * @return {object} The server response
	 */
	async watch(options) {
		const defaultOptions = {
			state: true,
			watch: true,
			presence: false,
		};

		// Make sure we wait for the connect promise if there is a pending one
		await this.getClient().wsPromise;

		if (!this.getClient()._hasConnectionID()) {
			defaultOptions.watch = false;
		}

		const combined = { ...defaultOptions, ...options };
		const state = await this.query(combined);
		this.initialized = true;
		this._initializeState(state);
		this.data = state.channel;

		this._client.logger(
			'info',
			`channel:watch() - started watching channel ${this.cid}`,
			{
				tags: ['channel'],
				channel: this,
			},
		);
		return state;
	}

	/**
	 * stopwatching - Stops watching the channel
	 *
	 * @return {object} The server response
	 */
	async stopWatching() {
		const response = await this.getClient().post(
			this._channelURL() + '/stop-watching',
			{},
		);

		this._client.logger(
			'info',
			`channel:watch() - stopped watching channel ${this.cid}`,
			{
				tags: ['channel'],
				channel: this,
			},
		);

		return response;
	}

	/**
	 * getReplies - List the message replies for a parent message
	 *
	 * @param {type} parent_id The message parent id, ie the top of the thread
	 * @param {type} options   Pagination params, ie {limit:10, idlte: 10}
	 *
	 * @return {type} A response with a list of messages
	 */
	async getReplies(parent_id, options) {
		const data = await this.getClient().get(
			this.getClient().baseURL + `/messages/${parent_id}/replies`,
			{
				...options,
			},
		);

		// add any messages to our thread state
		if (data.messages) {
			this.state.addMessagesSorted(data.messages);
		}

		return data;
	}

	/**
	 * getReactions - List the reactions, supports pagination
	 *
	 * @param {string} message_id The message id
	 * @param {object} options    The pagination options
	 *
	 * @return {object} Server response
	 */
	async getReactions(message_id, options) {
		return await this.getClient().get(
			this.getClient().baseURL + `/messages/${message_id}/reactions`,
			{
				...options,
			},
		);
	}

	/**
	 * lastRead - returns the last time the user marked the channel as read if the user never marked the channel as read, this will return null
	 * @return {date}
	 */
	lastRead() {
		this._checkInitialized();
		return this.state.read[this.getClient().userID]
			? this.state.read[this.getClient().userID].last_read
			: null;
	}

	/**
	 * countUnread - Count the number of messages with a date thats newer than the last read timestamp
	 *
	 * @param [date] lastRead the time that the user read a message, defaults to current user's read state
	 *
	 * @return {int} Unread count
	 */
	countUnread(lastRead) {
		if (lastRead == null) {
			lastRead = this.lastRead();
		}
		let count = 0;
		for (const m of this.state.messages) {
			if (this.getClient().userID === m.user.id) {
				continue;
			}
			if (lastRead == null) {
				count++;
				continue;
			}
			if (m.created_at > lastRead) {
				count++;
			}
		}
		return count;
	}

	/**
	 * countUnread - Count the number of unread messages mentioning the current user
	 *
	 * @return {int} Unread mentions count
	 */
	countUnreadMentions() {
		const lastRead = this.lastRead();
		let count = 0;
		for (const m of this.state.messages) {
			if (this.getClient().userID === m.user.id) {
				continue;
			}
			if (lastRead == null) {
				count++;
				continue;
			}
			if (m.created_at > lastRead) {
				const userID = this.getClient().userID;
				if (m.mentioned_users.findIndex(u => u.id === userID) !== -1) {
					count++;
				}
			}
		}
		return count;
	}

	/**
	 * create - Creates a new channel
	 *
	 * @return {type} The Server Response
	 */
	create = async () => {
		const options = {
			watch: false,
			state: false,
			presence: false,
		};
		return await this.query(options);
	};

	/**
	 * query - Query the API, get messages, members or other channel fields
	 *
	 * @param {object} options The query options
	 *
	 * @return {object} Returns a query response
	 */
	async query(options) {
		// Make sure we wait for the connect promise if there is a pending one
		await this.getClient().wsPromise;

		let queryURL = `${this.getClient().baseURL}/channels/${this.type}`;
		if (this.id) {
			queryURL += `/${this.id}`;
		}

		const state = await this.getClient().post(queryURL + '/query', {
			data: this._data,
			state: true,
			...options,
		});

		// update the channel id if it was missing
		if (!this.id) {
			this.id = state.channel.id;
			this.cid = state.channel.cid;
			// set the channel as active...
			if (!(this.cid in this.getClient().activeChannels)) {
				this.getClient().activeChannels[this.cid] = this;
			}
		}

		this.getClient()._addChannelConfig(state);

		// add any messages to our channel state
		this._initializeState(state);

		return state;
	}

	/**
	 * banUser - Bans a user from a channel
	 *
	 * @param targetUserID
	 * @param options
	 * @returns {Promise<*>}
	 */
	async banUser(targetUserID, options) {
		this._checkInitialized();
		return await this.getClient().banUser(targetUserID, {
			...options,
			type: this.type,
			id: this.id,
		});
	}

	/**
	 * hides the channel from queryChannels for the user until a message is added
	 * If clearHistory is set to true - all messages will be removed for the user
	 *
	 * @param userId
	 * @param clearHistory
	 * @returns {Promise<*>}
	 */
	async hide(userId = null, clearHistory = false) {
		this._checkInitialized();

		return await this.getClient().post(`${this._channelURL()}/hide`, {
			user_id: userId,
			clear_history: clearHistory,
		});
	}

	/**
	 * removes the hidden status for a channel
	 *
	 * @param userId
	 * @returns {Promise<*>}
	 */
	async show(userId = null) {
		this._checkInitialized();
		return await this.getClient().post(`${this._channelURL()}/show`, {
			user_id: userId,
		});
	}

	/**
	 * banUser - Removes the bans for a user on a channel
	 *
	 * @param targetUserID
	 * @returns {Promise<*>}
	 */
	async unbanUser(targetUserID) {
		this._checkInitialized();
		return await this.getClient().unbanUser(targetUserID, {
			type: this.type,
			id: this.id,
		});
	}

	/**
	 * on - Listen to events on this channel.
	 *
	 * channel.on('message.new', event => {console.log("my new message", event, channel.state.messages)})
	 * or
	 * channel.on(event => {console.log(event.type)})
	 *
	 * @param {string} callbackOrString  The event type to listen for (optional)
	 * @param {function} callbackOrNothing The callback to call
	 *
	 * @return {type} Description
	 */
	on(callbackOrString, callbackOrNothing) {
		const key = callbackOrNothing ? callbackOrString : 'all';
		const valid = isValidEventType(key);
		if (!valid) {
			throw Error(`Invalid event type ${key}`);
		}
		const callback = callbackOrNothing ? callbackOrNothing : callbackOrString;
		if (!(key in this.listeners)) {
			this.listeners[key] = [];
		}
		this._client.logger(
			'info',
			`Attaching listener for ${key} event on channel ${this.cid}`,
			{
				tags: ['event', 'channel'],
				channel: this,
			},
		);

		this.listeners[key].push(callback);
	}

	/**
	 * off - Remove the event handler
	 *
	 */
	off(callbackOrString, callbackOrNothing) {
		this._checkInitialized();
		const key = callbackOrNothing ? callbackOrString : 'all';
		const valid = isValidEventType(key);
		if (!valid) {
			throw Error(`Invalid event type ${key}`);
		}
		const callback = callbackOrNothing ? callbackOrNothing : callbackOrString;
		if (!(key in this.listeners)) {
			this.listeners[key] = [];
		}

		this._client.logger(
			'info',
			`Removing listener for ${key} event from channel ${this.cid}`,
			{ tags: ['event', 'channel'], channel: this },
		);
		this.listeners[key] = this.listeners[key].filter(value => value !== callback);
	}

	_handleChannelEvent(event) {
		const channel = this;
		this._client.logger(
			'info',
			`channel:_handleChannelEvent - Received event of type { ${event.type} } on ${this.cid}`,
			{
				tags: ['event', 'channel'],
				channel: this,
			},
		);

		const s = channel.state;
		switch (event.type) {
			case 'typing.start':
				s.typing = s.typing.set(event.user.id, Immutable(event));
				break;
			case 'typing.stop':
				s.typing = s.typing.without(event.user.id);
				break;
			case 'message.read':
				s.read = s.read.set(
					event.user.id,
					Immutable({ user: { ...event.user }, last_read: event.received_at }),
				);
				break;
			case 'user.watching.start':
			case 'user.updated':
				s.watchers = s.watchers.set(event.user.id, Immutable(event.user));
				break;
			case 'user.watching.stop':
				s.watchers = s.watchers.without(event.user.id);
				break;
			case 'message.new':
			case 'message.updated':
			case 'message.deleted':
				s.addMessageSorted(event.message);
				break;
			case 'channel.truncated':
				s.clearMessages();
				break;
			case 'member.added':
			case 'member.updated':
				s.members = s.members.set(event.member.user_id, Immutable(event.member));
				break;
			case 'member.removed':
				s.members = s.members.without(event.user.id);
				break;
			case 'channel.updated':
				channel.data = Immutable(event.channel);
				break;
			case 'reaction.new':
				s.addReaction(event.reaction, event.message);
				break;
			case 'reaction.deleted':
				s.removeReaction(event.reaction, event.message);
				break;
			case 'channel.hidden':
				if (event.clear_history) {
					s.clearMessages();
				}
				break;
			default:
		}

		// any event can send over the online count
		if (event.watcher_count !== undefined) {
			channel.state.watcher_count = event.watcher_count;
		}
	}

	_callChannelListeners = event => {
		const channel = this;
		// gather and call the listeners
		const listeners = [];
		if (channel.listeners.all) {
			listeners.push(...channel.listeners.all);
		}
		if (channel.listeners[event.type]) {
			listeners.push(...channel.listeners[event.type]);
		}

		// call the event and send it to the listeners
		for (const listener of listeners) {
			listener(event);
		}
	};

	/**
	 * _channelURL - Returns the channel url
	 *
	 * @return {string} The channel url
	 */
	_channelURL = () => {
		if (!this.id) {
			throw new Error('channel id is not defined');
		}
		return `${this.getClient().baseURL}/channels/${this.type}/${this.id}`;
	};

	_checkInitialized() {
		if (!this.initialized && !this.getClient()._isUsingServerAuth()) {
			throw Error(
				`Channel ${this.cid} hasn't been initialized yet. Make sure to call .watch() and wait for it to resolve`,
			);
		}
	}

	_initializeState(state) {
		// add the Users
		if (state.members) {
			for (const m of state.members) {
				this.getClient().state.updateUserReference(m.user, this.cid);
			}
		}

		if (state.watchers) {
			for (const w of state.watchers) {
				this.getClient().state.updateUserReference(w.user, this.cid);
			}
		}

		// immutable list of maps
		const messages = state.messages || [];
		if (!this.state.messages) {
			this.state.messages = Immutable([]);
		}
		this.state.addMessagesSorted(messages, true);
		this.state.watcher_count = state.watcher_count;
		// convert the arrays into objects for easier syncing...
		if (state.watchers) {
			for (const watcher of state.watchers) {
				this.state.watchers = this.state.watchers.set(watcher.id, watcher);
			}
		}
		if (state.read) {
			if (this.getClient().userID != null) {
				this.state.read = this.state.read.set(
					this.getClient().user.id,
					new Date(0),
				);
			}
			for (const read of state.read) {
				const parsedRead = Object.assign({ ...read });
				parsedRead.last_read = new Date(read.last_read);
				this.state.read = this.state.read.set(read.user.id, parsedRead);
			}
		}
		if (state.members) {
			for (const m of state.members) {
				this.state.members = this.state.members.set(m.user.id, m);
			}
		}
	}

	_disconnect() {
		this._client.logger(
			'info',
			`channel:disconnect() - Disconnecting the channel ${this.cid}`,
			{
				tags: ['connection', 'channel'],
				channel: this,
			},
		);

		this.disconnected = true;
	}
}
