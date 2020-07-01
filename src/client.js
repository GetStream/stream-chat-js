/* eslint no-unused-vars: "off" */
/* global process */

import axios from 'axios';
import uuidv4 from 'uuid/v4';
import { Channel } from './channel';
import { ClientState } from './client_state';
import { StableWSConnection } from './connection';

import { isValidEventType } from './events';

import { JWTUserToken, DevToken, CheckSignature } from './signing';
import http from 'http';
import https from 'https';
import FormData from 'form-data';
import pkg from '../package.json';
import { TokenManager } from './token_manager';
import { isFunction, chatCodes } from './utils';

function isReadableStream(obj) {
	return (
		obj !== null &&
		typeof obj === 'object' &&
		typeof obj._read === 'function' &&
		typeof obj._readableState === 'object'
	);
}

export class StreamChat {
	constructor(key, secretOrOptions, options) {
		// set the key
		this.key = key;
		this.secret = null;
		this.listeners = {};
		this.state = new ClientState();
		// a list of channels to hide ws events from
		this.mutedChannels = [];

		// set the secret
		if (secretOrOptions && secretOrOptions.indexOf) {
			this.secret = secretOrOptions;
		}

		// set the options... and figure out defaults...
		options = options || secretOrOptions;
		if (!options) {
			options = {};
		}

		this.browser =
			typeof options.browser !== 'undefined'
				? options.browser
				: typeof window !== 'undefined';
		this.node = !this.browser;

		const defaultOptions = {
			timeout: 3000,
			withCredentials: false, // making sure cookies are not sent
		};

		if (this.node) {
			const nodeOptions = {
				httpAgent: new http.Agent({ keepAlive: 3000 }),
				httpsAgent: new https.Agent({ keepAlive: 3000 }),
			};
			this.options = { ...nodeOptions, ...defaultOptions, ...options };
		} else {
			this.options = { ...defaultOptions, ...options };
			delete this.options.httpAgent;
			delete this.options.httpsAgent;
		}

		this.request = axios.create(this.options);

		this.setBaseURL('https://chat-us-east-1.stream-io-api.com');

		if (typeof process !== 'undefined' && process.env.STREAM_LOCAL_TEST_RUN) {
			this.setBaseURL('http://localhost:3030');
		}

		// WS connection is initialized when setUser is called
		this.wsConnection = null;
		this.wsPromise = null;
		this.setUserPromise = null;
		// keeps a reference to all the channels that are in use
		this.activeChannels = {};
		// mapping between channel groups and configs
		this.configs = {};
		this.anonymous = false;

		// If its a server-side client, then lets initialize the tokenManager, since token will be
		// generated from secret.
		this.tokenManager = new TokenManager(this.secret);

		/**
		 * logger function should accept 3 parameters:
		 * @param logLevel string
		 * @param message   string
		 * @param extraData object
		 *
		 * e.g.,
		 * const client = new StreamChat('api_key', {}, {
		 * 		logger = (logLevel, message, extraData) => {
		 * 			console.log(message);
		 * 		}
		 * })
		 *
		 * extraData contains tags array attached to log message. Tags can have one/many of following values:
		 * 1. api
		 * 2. api_request
		 * 3. api_response
		 * 4. client
		 * 5. channel
		 * 6. connection
		 * 7. event
		 *
		 * It may also contains some extra data, some examples have been mentioned below:
		 * 1. {
		 * 		tags: ['api', 'api_request', 'client'],
		 * 		url: string,
		 * 		payload: object,
		 * 		config: object
		 * }
		 * 2. {
		 * 		tags: ['api', 'api_response', 'client'],
		 * 		url: string,
		 * 		response: object
		 * }
		 * 3. {
		 * 		tags: ['api', 'api_response', 'client'],
		 * 		url: string,
		 * 		error: object
		 * }
		 * 4. {
		 * 		tags: ['event', 'client'],
		 * 		event: object
		 * }
		 * 5. {
		 * 		tags: ['channel'],
		 * 		channel: object
		 * }
		 */
		this.logger = isFunction(options.logger) ? options.logger : () => {};
	}

	devToken(userID) {
		return DevToken(userID);
	}

	getAuthType() {
		return this.anonymous ? 'anonymous' : 'jwt';
	}

	setBaseURL(baseURL) {
		this.baseURL = baseURL;
		this.wsBaseURL = this.baseURL.replace('http', 'ws');
	}

	_setupConnection = () => {
		this.UUID = uuidv4();
		this.clientID = `${this.userID}--${this.UUID}`;
		this.wsPromise = this.connect();
		this._startCleaning();
		return this.wsPromise;
	};

	_hasConnectionID = () => Boolean(this.connectionID);

	/**
	 * setUser - Set the current user, this triggers a connection to the API
	 *
	 * @param {object} user Data about this user. IE {name: "john"}
	 * @param {string} userToken   Token
	 *
	 * @return {promise} Returns a promise that resolves when the connection is setup
	 */
	setUser = (user, userTokenOrProvider) => {
		if (this.userID) {
			throw new Error(
				'Use client.disconnect() before trying to connect as a different user. setUser was called twice.',
			);
		}
		// we generate the client id client side
		this.userID = user.id;

		if (!this.userID) {
			throw new Error('The "id" field on the user is missing');
		}

		const setTokenPromise = this._setToken(user, userTokenOrProvider);
		this._setUser(user);

		const wsPromise = this._setupConnection();

		this.anonymous = false;

		this.setUserPromise = Promise.all([setTokenPromise, wsPromise])
			.then(
				result =>
					// We only return connection promise;
					result[1],
			)
			.catch(e => {
				throw e;
			});

		return this.setUserPromise;
	};

	_setToken = (user, userTokenOrProvider) =>
		this.tokenManager.setTokenOrProvider(userTokenOrProvider, user);

	_setUser(user) {
		// this one is used by the frontend
		this.user = user;
		// this one is actually used for requests...
		this._user = { ...user };
	}

	/**
	 * updateAppSettings - updates application settings
	 *
	 * @param {object} options App settings.
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
	async updateAppSettings(options) {
		if (options.apn_config && options.apn_config.p12_cert) {
			options.apn_config.p12_cert = Buffer.from(
				options.apn_config.p12_cert,
			).toString('base64');
		}
		return await this.patch(this.baseURL + '/app', options);
	}

	/**
	 * getAppSettings - retrieves application settings
	 */
	async getAppSettings() {
		return await this.get(this.baseURL + '/app');
	}

	/**
	 * testPushSettings - Tests the push settings for a user with a random chat message and the configured push templates
	 *
	 * @param {string} userID User ID. If user has no devices, it will error
	 * @param {object} [data] Overrides for push templates/message used
	 * 		IE: {
				  messageID: 'id-of-message',//will error if message does not exist
				  apnTemplate: '{}', //if app doesn't have apn configured it will error
				  firebaseTemplate: '{}', //if app doesn't have firebase configured it will error
				  firebaseDataTemplate: '{}', //if app doesn't have firebase configured it will error
			}
	 */
	async testPushSettings(userID, data = {}) {
		return await this.post(this.baseURL + '/check_push', {
			user_id: userID,
			...(data.messageID ? { message_id: data.messageID } : {}),
			...(data.apnTemplate ? { apn_template: data.apnTemplate } : {}),
			...(data.firebaseTemplate
				? { firebase_template: data.firebaseTemplate }
				: {}),
			...(data.firebaseDataTemplate
				? { firebase_data_template: data.firebaseDataTemplate }
				: {}),
		});
	}

	/**
	 * disconnect - closes the WS connection
	 */
	disconnect(timeout) {
		this.logger('info', 'client:disconnect() - Disconnecting the client', {
			tags: ['connection', 'client'],
		});
		// remove the user specific fields
		delete this.user;
		delete this._user;
		delete this.userID;

		if (this.cleaningIntervalRef != null) {
			clearInterval(this.cleaningIntervalRef);
			this.cleaningIntervalRef = null;
		}

		this.anonymous = false;

		this.connectionEstablishedCount = 0;

		for (const channel of Object.values(this.activeChannels)) {
			channel._disconnect();
		}
		// ensure we no longer return inactive channels
		this.activeChannels = {};
		// reset client state
		this.state = new ClientState();
		// reset token manager
		this.tokenManager.reset();

		// close the WS connection
		if (this.wsConnection) {
			return this.wsConnection.disconnect(timeout);
		}

		return Promise.resolve();
	}

	setAnonymousUser = () => {
		this.anonymous = true;
		this.userID = uuidv4();
		const anonymousUser = {
			id: this.userID,
			anon: true,
		};

		this._setToken(anonymousUser, '');
		this._setUser(anonymousUser);

		return this._setupConnection();
	};

	/**
	 * setGuestUser - Setup a temporary guest user
	 *
	 * @param {object} user Data about this user. IE {name: "john"}
	 *
	 * @return {promise} Returns a promise that resolves when the connection is setup
	 */
	async setGuestUser(user) {
		let response;
		this.anonymous = true;
		try {
			response = await this.post(this.baseURL + '/guest', { user });
		} catch (e) {
			this.anonymous = false;
			throw e;
		}
		this.anonymous = false;
		const {
			created_at,
			updated_at,
			last_active,
			online,
			...guestUser
		} = response.user;
		return await this.setUser(guestUser, response.access_token);
	}

	/**
	 * createToken - Creates a token to authenticate this user. This function is used server side.
	 * The resulting token should be passed to the client side when the users registers or logs in
	 *
	 * @param {string}   userID         The User ID
	 * @param {string}   exp            The expiration time for the token expressed in the number of seconds since the epoch
	 *
	 * @return {string} Returns a token
	 */
	createToken(userID, exp) {
		if (this.secret == null) {
			throw Error(`tokens can only be created server-side using the API Secret`);
		}
		const extra = {};

		if (exp) {
			extra.exp = exp;
		}

		return JWTUserToken(this.secret, userID, extra, {});
	}

	/**
	 * on - Listen to events on all channels and users your watching
	 *
	 * client.on('message.new', event => {console.log("my new message", event, channel.state.messages)})
	 * or
	 * client.on(event => {console.log(event.type)})
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
		this.logger('info', `Attaching listener for ${key} event`, {
			tags: ['event', 'client'],
		});
		this.listeners[key].push(callback);
		return {
			unsubscribe: () => {
				this.listeners[key] = this.listeners[key].filter(el => el !== callback);
			},
		};
	}

	/**
	 * off - Remove the event handler
	 *
	 */
	off(callbackOrString, callbackOrNothing) {
		const key = callbackOrNothing ? callbackOrString : 'all';
		const valid = isValidEventType(key);
		if (!valid) {
			throw Error(`Invalid event type ${key}`);
		}
		const callback = callbackOrNothing ? callbackOrNothing : callbackOrString;
		if (!(key in this.listeners)) {
			this.listeners[key] = [];
		}

		this.logger('info', `Removing listener for ${key} event`, {
			tags: ['event', 'client'],
		});
		this.listeners[key] = this.listeners[key].filter(value => value !== callback);
	}

	_logApiRequest(type, url, data, config) {
		this.logger('info', `client: ${type} - Request - ${url}`, {
			tags: ['api', 'api_request', 'client'],
			url,
			payload: data,
			config,
		});
	}

	_logApiResponse(type, url, response) {
		this.logger(
			'info',
			`client:${type} - Response - url: ${url} > status ${response.status}`,
			{
				tags: ['api', 'api_response', 'client'],
				url,
				response,
			},
		);
	}

	_logApiError(type, url, error) {
		this.logger('error', `client:${type} - Error - url: ${url}`, {
			tags: ['api', 'api_response', 'client'],
			url,
			error,
		});
	}

	doAxiosRequest = async (type, url, data, options = {}) => {
		await this.tokenManager.tokenReady();
		const requestConfig = this._enrichAxiosOptions(options);
		try {
			let response;
			this._logApiRequest(type, url, data, requestConfig);
			switch (type) {
				case 'get':
					response = await this.request.get(url, requestConfig);
					break;
				case 'delete':
					response = await this.request.delete(url, requestConfig);
					break;
				case 'post':
					response = await this.request.post(url, data, requestConfig);
					break;
				case 'put':
					response = await this.request.put(url, data, requestConfig);
					break;
				case 'patch':
					response = await this.request.patch(url, data, requestConfig);
					break;
				default:
					break;
			}
			this._logApiResponse(type, url, response);

			return this.handleResponse(response);
		} catch (e) {
			this._logApiError(type, url, e);

			if (e.response) {
				if (
					e.response.data.code === chatCodes.TOKEN_EXPIRED &&
					!this.tokenManager.isStatic()
				) {
					this.tokenManager.loadToken();
					return await this.doAxiosRequest(type, url, data, options);
				}
				return this.handleResponse(e.response);
			} else {
				throw e;
			}
		}
	};

	get(url, params) {
		return this.doAxiosRequest('get', url, null, { params });
	}

	put(url, data) {
		return this.doAxiosRequest('put', url, data);
	}

	post(url, data) {
		return this.doAxiosRequest('post', url, data);
	}

	patch(url, data) {
		return this.doAxiosRequest('patch', url, data);
	}

	delete(url, params) {
		return this.doAxiosRequest('delete', url, null, { params });
	}

	sendFile(url, uri, name, contentType, user) {
		const data = new FormData();
		let fileField;

		if (isReadableStream(uri) || uri instanceof File) {
			fileField = uri;
		} else {
			fileField = {
				uri,
				name: name || uri.split('/').reverse()[0],
			};
			if (contentType != null) {
				fileField.type = contentType;
			}
		}

		if (user != null) {
			data.append('user', JSON.stringify(user));
		}
		data.append('file', fileField);
		return this.doAxiosRequest('post', url, data, {
			headers: data.getHeaders ? data.getHeaders() : {}, // node vs browser
			config: {
				timeout: 0,
				maxContentLength: Infinity,
				maxBodyLength: Infinity,
			},
		});
	}

	errorFromResponse(response) {
		let err;
		err = new Error(`StreamChat error HTTP code: ${response.status}`);
		if (response.data && response.data.code) {
			err = new Error(
				`StreamChat error code ${response.data.code}: ${response.data.message}`,
			);
			err.code = response.data.code;
		}
		err.response = response;
		err.status = response.status;
		return err;
	}

	handleResponse(response) {
		const data = response.data;
		if ((response.status + '')[0] !== '2') {
			throw this.errorFromResponse(response);
		}
		return data;
	}

	dispatchEvent = event => {
		// client event handlers
		this._handleClientEvent(event);

		// channel event handlers
		const cid = event.cid;
		const channel = this.activeChannels[cid];
		if (channel) {
			channel._handleChannelEvent(event);
		}

		this._callClientListeners(event);

		if (channel) {
			channel._callChannelListeners(event);
		}
	};

	handleEvent = messageEvent => {
		// dispatch the event to the channel listeners
		const jsonString = messageEvent.data;
		const event = JSON.parse(jsonString);
		event.received_at = new Date();
		this.dispatchEvent(event);
	};

	_handleClientEvent(event) {
		const client = this;
		this.logger(
			'info',
			`client:_handleClientEvent - Received event of type { ${event.type} }`,
			{
				tags: ['event', 'client'],
				event,
			},
		);

		// update the client.state with any changes to users
		if (event.type === 'user.presence.changed' || event.type === 'user.updated') {
			if (event.user.id === this.userID) {
				this.user = { ...this.user, ...event.user };
				// Updating only available properties in _user object.
				Object.keys(event.user).forEach(function(key) {
					if (key in client._user) {
						client._user[key] = event.user[key];
					}
				});
			}
			client.state.updateUser(event.user);
			client._updateUserReferences(event.user);
		}
		if (event.type === 'health.check' && event.me) {
			client.user = event.me;
			client.state.updateUser(event.me);
			client.mutedChannels = event.me.channel_mutes;
		}

		if (event.type === 'notification.message_new') {
			this.configs[event.channel.type] = event.channel.config;
		}

		if (event.type === 'notification.channel_mutes_updated') {
			this.mutedChannels = event.me.channel_mutes;
		}
	}

	_muteStatus(cid) {
		let muteStatus;
		this.mutedChannels.forEach(function(mute) {
			if (mute.channel.cid === cid) {
				let muted = true;
				if (mute.expires) {
					muted = new Date(mute.expires).getTime() > new Date().getTime();
				}
				muteStatus = {
					muted,
					createdAt: new Date(mute.created_at),
					expiresAt: mute.expires ? new Date(mute.expires) : null,
				};
			}
		});

		if (muteStatus) {
			return muteStatus;
		}

		return {
			muted: false,
			createdAt: null,
			expiresAt: null,
		};
	}

	_callClientListeners = event => {
		const client = this;
		// gather and call the listeners
		const listeners = [];
		if (client.listeners.all) {
			listeners.push(...client.listeners.all);
		}
		if (client.listeners[event.type]) {
			listeners.push(...client.listeners[event.type]);
		}

		// call the event and send it to the listeners
		for (const listener of listeners) {
			listener(event);
		}
	};

	recoverState = async () => {
		this.logger(
			'info',
			`client:recoverState() - Start of recoverState with connectionID ${this.wsConnection.connectionID}`,
			{
				tags: ['connection'],
			},
		);
		this.connectionID = this.wsConnection.connectionID;
		const cids = Object.keys(this.activeChannels);
		const lastMessageIDs = {};
		for (const c of Object.values(this.activeChannels)) {
			const lastMessage = c.lastMessage();
			let lastMessageId;
			if (lastMessage) {
				lastMessageId = lastMessage.id;
			}
			lastMessageIDs[c.cid] = lastMessageId;
		}
		if (cids.length) {
			this.logger(
				'info',
				`client:recoverState() - Start the querying of ${cids.length} channels`,
				{ tags: ['connection', 'client'] },
			);

			await this.queryChannels(
				{ cid: { $in: cids } },
				{ last_message_at: -1 },
				{ limit: 30, recovery: true, last_message_ids: lastMessageIDs },
			);

			this.logger('info', 'client:recoverState() - Querying channels finished', {
				tags: ['connection', 'client'],
			});

			this.dispatchEvent({
				type: 'connection.recovered',
			});
		}

		this.wsPromise = Promise.resolve();
		this.setUserPromise = Promise.resolve();
	};

	/*
	_updateUserReferences updates the members and watchers of the currently active channels
	that contain this user
	*/
	_updateUserReferences(user) {
		const refMap = this.state.userChannelReferences[user.id] || {};
		const refs = Object.keys(refMap);
		for (const channelID of refs) {
			const c = this.activeChannels[channelID];
			// search the members and watchers and update as needed...
			if (c && c.state) {
				if (c.state.members[user.id]) {
					c.state.members = c.state.members.setIn([user.id, 'user'], user);
				}
				if (c.state.watchers[user.id]) {
					c.state.watchers = c.state.watchers.setIn([user.id, 'user'], user);
				}
			}
		}
	}

	async connect() {
		this.connecting = true;
		const client = this;
		this.failures = 0;

		if (client.userID == null) {
			throw Error(
				'Call setUser or setAnonymousUser before starting the connection',
			);
		}

		// The StableWSConnection handles all the reconnection logic.
		this.wsConnection = new StableWSConnection({
			wsBaseURL: client.wsBaseURL,
			tokenManager: client.tokenManager,
			user: this._user,
			authType: this.getAuthType(),
			userAgent: this._userAgent(),
			apiKey: this.key,
			recoverCallback: this.recoverState,
			messageCallback: this.handleEvent,
			eventCallback: this.dispatchEvent,
			logger: this.logger,
		});

		const handshake = await this.wsConnection.connect();
		this.connectionID = this.wsConnection.connectionID;
		return handshake;
	}

	/**
	 * queryUsers - Query users and watch user presence
	 *
	 * @param {object} filterConditions MongoDB style filter conditions
	 * @param {object} sort             Sort options, for instance {last_active: -1}
	 * @param {object} options          Option object, {presence: true}
	 *
	 * @return {object} User Query Response
	 */
	async queryUsers(filterConditions, sort, options) {
		if (!sort) {
			sort = {};
		}
		if (!options) {
			options = {};
		}
		const sortFields = [];
		for (const [k, v] of Object.entries(sort)) {
			sortFields.push({ field: k, direction: v });
		}

		const defaultOptions = {
			presence: false,
		};

		// Make sure we wait for the connect promise if there is a pending one
		await this.setUserPromise;

		if (!this._hasConnectionID()) {
			defaultOptions.presence = false;
		}

		// Return a list of users
		const data = await this.get(this.baseURL + '/users', {
			payload: {
				filter_conditions: filterConditions,
				sort: sortFields,
				...defaultOptions,
				...options,
			},
		});

		this.state.updateUsers(data.users);

		return data;
	}

	async queryChannels(filterConditions, sort = {}, options = {}) {
		const sortFields = [];

		for (const [k, v] of Object.entries(sort)) {
			sortFields.push({ field: k, direction: v });
		}

		const defaultOptions = {
			state: true,
			watch: true,
			presence: false,
		};

		// Make sure we wait for the connect promise if there is a pending one
		await this.setUserPromise;

		if (!this._hasConnectionID()) {
			defaultOptions.watch = false;
		}

		// Return a list of channels
		const payload = {
			filter_conditions: filterConditions,
			sort: sortFields,
			user_details: this._user,
			...defaultOptions,
			...options,
		};

		const data = await this.get(this.baseURL + '/channels', {
			payload,
		});

		const channels = [];

		// update our cache of the configs
		for (const channelState of data.channels) {
			this._addChannelConfig(channelState);
		}

		for (const channelState of data.channels) {
			const c = this.channel(channelState.channel.type, channelState.channel.id);
			c.data = channelState.channel;
			c.initialized = true;
			c._initializeState(channelState);
			channels.push(c);
		}
		return channels;
	}

	/**
	 * search - Query messages
	 *
	 * @param {object} channels MongoDB style filter conditions
	 * @param {object|string}  message search query or object MongoDB style filters
	 * @param {object} options       Option object, {user_id: 'tommaso'}
	 *
	 * @return {object} search messages response
	 */
	async search(filterConditions, query, options = {}) {
		// Return a list of channels
		const payload = {
			filter_conditions: filterConditions,
			...options,
		};
		if (typeof query === 'string') {
			payload.query = query;
		} else if (typeof query === 'object') {
			payload.message_filter_conditions = query;
		} else {
			throw Error(`Invalid type ${typeof query} for query parameter`);
		}

		// Make sure we wait for the connect promise if there is a pending one
		await this.setUserPromise;

		return await this.get(this.baseURL + '/search', {
			payload,
		});
	}

	/**
	 * addDevice - Adds a push device for a user.
	 *
	 * @param {string} id the device id
	 * @param {string} push_provider the push provider (apn or firebase)
	 * @param {string} [userID] the user id (defaults to current user)
	 *
	 */
	async addDevice(id, push_provider, userID = null) {
		return await this.post(this.baseURL + '/devices', {
			id,
			push_provider,
			...(userID != null ? { user_id: userID } : {}),
		});
	}

	/**
	 * getDevices - Returns the devices associated with a current user
	 *
	 * @param {string} [userID] User ID. Only works on serversidex
	 *
	 * @return {devices} Array of devices
	 */
	async getDevices(userID) {
		return await this.get(
			this.baseURL + '/devices',
			userID ? { user_id: userID } : {},
		);
	}

	/**
	 * removeDevice - Removes the device with the given id. Clientside users can only delete their own devices
	 *
	 * @param {string} id The device id
	 * @param {string} [userID] The user id. Only specify this for serverside requests
	 *
	 */
	async removeDevice(id, userID = null) {
		return await this.delete(this.baseURL + '/devices', {
			id,
			...(userID ? { user_id: userID } : {}),
		});
	}

	_addChannelConfig(channelState) {
		this.configs[channelState.channel.type] = channelState.channel.config;
	}

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
	channel(channelType, channelID, custom = {}) {
		if (!this.userID && !this._isUsingServerAuth()) {
			throw Error('Call setUser or setAnonymousUser before creating a channel');
		}

		if (~channelType.indexOf(':')) {
			throw Error(
				`Invalid channel group ${channelType}, can't contain the : character`,
			);
		}

		// support channel("messaging", null, {options})
		// support channel("messaging", undefined, {options})
		// support channel("messaging", "", {options})
		if (channelID == null || channelID === '') {
			return new Channel(this, channelType, undefined, custom || {});
		}
		// support channel("messaging", {options})
		if (typeof channelID === 'object' && arguments.length === 2) {
			return new Channel(this, channelType, undefined, channelID);
		}

		if (typeof channelID === 'string' && ~channelID.indexOf(':')) {
			throw Error(`Invalid channel id ${channelID}, can't contain the : character`);
		}

		// only allow 1 channel object per cid
		const cid = `${channelType}:${channelID}`;
		if (cid in this.activeChannels) {
			const channel = this.activeChannels[cid];
			if (Object.keys(custom).length > 0) {
				channel.data = custom;
				channel._data = custom;
			}
			return channel;
		}
		const channel = new Channel(this, channelType, channelID, custom);
		this.activeChannels[channel.cid] = channel;

		return channel;
	}

	/**
	 * @deprecated Please use upsertUser() function instead.
	 *
	 * updateUser - Update or Create the given user object
	 *
	 * @param {object} A user object, the only required field is the user id. IE {id: "myuser"} is valid
	 *
	 * @return {object}
	 */
	async updateUser(userObject) {
		return await this.upsertUsers([userObject]);
	}

	/**
	 * partialUpdateUser - Update the given user object
	 *
	 * @param {object} Object which should contain id and any of "set" or "unset" params;
	 * example: {id: "user1", set:{field: value}, unset:["field2"]}
	 *
	 * @return {object} list of updated users
	 */
	async partialUpdateUser(userObject) {
		return await this.partialUpdateUsers([userObject]);
	}

	/**
	 * upsertUsers - Batch upsert the list of users
	 *
	 * @param {array} A list of users
	 *
	 * @return {object}
	 */
	async upsertUsers(users) {
		const userMap = {};
		for (const userObject of users) {
			if (!userObject.id) {
				throw Error('User ID is required when updating a user');
			}
			userMap[userObject.id] = userObject;
		}

		return await this.post(this.baseURL + '/users', {
			users: userMap,
		});
	}

	/**
	 * upsertUser - Update or Create the given user object
	 *
	 * @param {object} A user object, the only required field is the user id. IE {id: "myuser"} is valid
	 *
	 * @return {object}
	 */
	upsertUser(userObject) {
		return this.upsertUsers([userObject]);
	}

	/**
	 * @deprecated Please use upsertUsers() function instead.
	 *
	 * updateUsers - Batch update the list of users
	 *
	 * @param {array} A list of users
	 *
	 * @return {object}
	 */
	updateUsers(users) {
		return this.upsertUsers(users);
	}

	/**
	 * updateUsers - Batch partial update of users
	 *
	 * @param {array} A list of partial update requests
	 *
	 * @return {object}
	 */
	async partialUpdateUsers(users) {
		for (const userObject of users) {
			if (!userObject.id) {
				throw Error('User ID is required when updating a user');
			}
		}

		return await this.patch(this.baseURL + '/users', {
			users,
		});
	}

	async deleteUser(userID, params) {
		return await this.delete(this.baseURL + `/users/${userID}`, params);
	}

	async reactivateUser(userID, options) {
		return await this.post(this.baseURL + `/users/${userID}/reactivate`, {
			...options,
		});
	}

	async deactivateUser(userID, options) {
		return await this.post(this.baseURL + `/users/${userID}/deactivate`, {
			...options,
		});
	}

	async exportUser(userID, options) {
		return await this.get(this.baseURL + `/users/${userID}/export`, {
			...options,
		});
	}

	/** banUser - bans a user from all channels
	 *
	 * @param targetUserID
	 * @param options
	 * @returns {Promise<*>}
	 */
	async banUser(targetUserID, options) {
		return await this.post(this.baseURL + '/moderation/ban', {
			target_user_id: targetUserID,
			...options,
		});
	}

	/** unbanUser - revoke global ban for a user
	 *
	 * @param targetUserID
	 * @returns {Promise<*>}
	 */
	async unbanUser(targetUserID, options) {
		return await this.delete(this.baseURL + '/moderation/ban', {
			target_user_id: targetUserID,
			...options,
		});
	}

	/** muteUser - mutes a user
	 *
	 * @param targetID
	 * @param [userID] Only used with serverside auth
	 * @returns {Promise<*>}
	 */
	async muteUser(targetID, userID = null) {
		return await this.post(this.baseURL + '/moderation/mute', {
			target_id: targetID,
			...(userID ? { user_id: userID } : {}),
		});
	}

	/** unmuteUser - unmutes a user
	 *
	 * @param targetID
	 * @param [currentUserID] Only used with serverside auth
	 * @returns {Promise<*>}
	 */
	async unmuteUser(targetID, currentUserID = null) {
		return await this.post(this.baseURL + '/moderation/unmute', {
			target_id: targetID,
			...(currentUserID ? { user_id: currentUserID } : {}),
		});
	}

	async flagMessage(messageID, options = {}) {
		return await this.post(this.baseURL + '/moderation/flag', {
			target_message_id: messageID,
			...options,
		});
	}

	async flagUser(userID, options = {}) {
		return await this.post(this.baseURL + '/moderation/flag', {
			target_user_id: userID,
			...options,
		});
	}

	async unflagMessage(messageID, options = {}) {
		return await this.post(this.baseURL + '/moderation/unflag', {
			target_message_id: messageID,
			...options,
		});
	}

	async unflagUser(userID, options = {}) {
		return await this.post(this.baseURL + '/moderation/unflag', {
			target_user_id: userID,
			...options,
		});
	}

	/**
	 * markAllRead - marks all channels for this user as read
	 *
	 * @return {Promise} Description
	 */
	async markAllRead(data = {}) {
		const response = await this.post(this.baseURL + '/channels/read', {
			...data,
		});
	}

	createChannelType(data) {
		const channelData = Object.assign({}, { commands: ['all'] }, data);
		return this.post(this.baseURL + '/channeltypes', channelData);
	}

	getChannelType(channelType) {
		return this.get(this.baseURL + `/channeltypes/${channelType}`);
	}

	updateChannelType(channelType, data) {
		return this.put(this.baseURL + `/channeltypes/${channelType}`, data);
	}

	deleteChannelType(channelType) {
		return this.delete(this.baseURL + `/channeltypes/${channelType}`);
	}

	listChannelTypes() {
		return this.get(this.baseURL + `/channeltypes`);
	}

	/**
	 * translateMessage - adds the translation to the message
	 *
	 * @param {string} messageId
	 *
	 * @return {object} Response that includes the message
	 */
	async translateMessage(messageId, language) {
		return await this.post(this.baseURL + `/messages/${messageId}/translate`, {
			language,
		});
	}

	/**
	 * updateMessage - Update the given message
	 *
	 * @param {object} message object, id needs to be specified
	 *
	 * @return {object} Response that includes the message
	 */
	async updateMessage(message, userId) {
		if (!message.id) {
			throw Error('Please specify the message id when calling updateMesssage');
		}

		const clonedMessage = Object.assign({}, message);
		delete clonedMessage.id;

		const reservedMessageFields = [
			'latest_reactions',
			'own_reactions',
			'reply_count',
			'reaction_counts',
			'created_at',
			'updated_at',
			'html',
			'command',
			'type',
			'user',
		];

		reservedMessageFields.forEach(function(item) {
			if (clonedMessage[item] != null) {
				delete clonedMessage[item];
			}
		});

		if (userId != null) {
			if (typeof userId == 'string' || userId instanceof String) {
				clonedMessage.user_id = userId;
			} else {
				clonedMessage.user = { id: userId.id };
			}
		}
		return await this.post(this.baseURL + `/messages/${message.id}`, {
			message: clonedMessage,
		});
	}

	async deleteMessage(messageID, hardDelete) {
		let params = {};
		if (hardDelete) {
			params = { hard: true };
		}
		return await this.delete(this.baseURL + `/messages/${messageID}`, params);
	}

	async getMessage(messageID) {
		return await this.get(this.baseURL + `/messages/${messageID}`);
	}

	_userAgent() {
		return `stream-chat-javascript-client-${this.node ? 'node' : 'browser'}-${
			pkg.version
		}`;
	}

	/**
	 * _isUsingServerAuth - Returns true if we're using server side auth
	 */
	_isUsingServerAuth = () => !!this.secret;

	_enrichAxiosOptions(options = { params: {}, headers: {}, config: {} }) {
		const token = this._getToken();

		return {
			params: {
				user_id: this.userID,
				...options.params,
				api_key: this.key,
				connection_id: this.connectionID,
			},
			headers: {
				Authorization: token,
				'stream-auth-type': this.getAuthType(),
				'x-stream-client': this._userAgent(),
				...options.headers,
			},
			...options.config,
		};
	}

	_getToken() {
		if (!this.tokenManager || this.anonymous) return null;

		return this.tokenManager.getToken();
	}

	_startCleaning() {
		const that = this;
		if (this.cleaningIntervalRef != null) {
			return;
		}
		this.cleaningIntervalRef = setInterval(() => {
			// call clean on the channel, used for calling the stop.typing event etc.
			for (const channel of Object.values(that.activeChannels)) {
				channel.clean();
			}
		}, 500);
	}

	verifyWebhook(requestBody, xSignature) {
		return CheckSignature(requestBody, this.secret, xSignature);
	}

	/** getPermission - gets the definition for a permission
	 *
	 * @param {string} name
	 * @returns {Promise<*>}
	 */
	getPermission(name) {
		return this.get(`${this.baseURL}/custom_permission/${name}`);
	}

	/** createPermission - creates a custom permission
	 *
	 * @param {object} permissionData the permission data
	 * @returns {Promise<*>}
	 */
	createPermission(permissionData) {
		return this.post(`${this.baseURL}/custom_permission`, { ...permissionData });
	}

	/** updatePermission - updates an existing custom permission
	 *
	 * @param {string} name
	 * @param {object} permissionData the permission data
	 * @returns {Promise<*>}
	 */
	updatePermission(name, permissionData) {
		return this.post(`${this.baseURL}/custom_permission/${name}`, {
			...permissionData,
		});
	}

	/** deletePermission - deletes a custom permission
	 *
	 * @param {name}
	 * @returns {Promise<*>}
	 */
	deletePermission(name) {
		return this.delete(`${this.baseURL}/custom_permission/${name}`);
	}

	/** listPermissions - returns the list of custom permissions for this application
	 *
	 * @returns {Promise<*>}
	 */
	listPermissions() {
		return this.get(`${this.baseURL}/custom_permission`);
	}

	/** createRole - creates a custom role
	 *
	 * @param {string} name the new role name
	 * @returns {Promise<*>}
	 */
	createRole(name) {
		return this.post(`${this.baseURL}/custom_role`, { name });
	}

	/** listRoles - returns the list of custom roles for this application
	 *
	 * @returns {Promise<*>}
	 */
	listRoles() {
		return this.get(`${this.baseURL}/custom_role`);
	}

	/** deleteRole - deletes a custom role
	 *
	 * @param {string} name the role name
	 * @returns {Promise<*>}
	 */
	deleteRole(name) {
		return this.delete(`${this.baseURL}/custom_role/${name}`);
	}

	/** sync - returns all events that happened for a list of channels since last sync
	 * @param {array} channel_cids list of channel CIDs
	 * @param {string} last_sync_at last time the user was online and in sync. RFC3339 ie. "2020-05-06T15:05:01.207Z"
	 */
	sync(channel_cids, last_sync_at) {
		return this.post(`${this.baseURL}/sync`, { channel_cids, last_sync_at });
	}
}
