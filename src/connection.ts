import isoWS from 'isomorphic-ws';
import { sleep, chatCodes } from './utils';
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
export class StableWSConnection {
	constructor({
		wsBaseURL,
		clientID,
		userID,
		user,
		userAgent,
		apiKey,
		tokenManager,
		authType,
		messageCallback,
		recoverCallback,
		eventCallback,
		logger,
	}) {
		this.wsBaseURL = wsBaseURL;
		this.clientID = clientID;
		this.userID = userID;
		this.user = user;
		this.authType = authType;
		this.userAgent = userAgent;
		this.apiKey = apiKey;
		this.tokenManager = tokenManager;
		/** consecutive failures influence the duration of the timeout */
		this.consecutiveFailures = 0;
		/** keep track of the total number of failures */
		this.totalFailures = 0;

		/** We only make 1 attempt to reconnect at the same time.. */
		this.isConnecting = false;
		/** Boolean that indicates if we have a working connection to the server */
		this.isHealthy = false;

		/** Callback when the connection fails and recovers */
		this.recoverCallback = recoverCallback;
		this.messageCallback = messageCallback;
		this.eventCallback = eventCallback;

		this.logger = logger;

		/** Incremented when a new WS connection is made */
		this.wsID = 1;

		/** Store the last event time for health checks */
		this.lastEvent = null;

		/** Send a health check message every 30 seconds */
		this.healthCheckInterval = 30 * 1000;
		/** Every second we verify that we didn't miss any health checks */
		this.monitorInterval = 1 * 1000;

		this._listenForConnectionChanges();
	}

	/**
	 * connect - Connect to the WS URL
	 *
	 * @return {promise} Promise that completes once the first health check message is received
	 */
	async connect() {
		let healthCheck;
		if (this.isConnecting) {
			throw Error(
				`You've called connect twice, can only attempt 1 connection at the time`,
			);
		}
		try {
			this.isConnecting = true;
			healthCheck = await this._connect();
			this.isConnecting = false;
			this.consecutiveFailures = 0;
			this._startMonitor();
			this._startHealthCheck();
			this.logger(
				'info',
				`connection:connect() - Established ws connection with healthcheck: ${healthCheck}`,
				{
					tags: ['connection'],
				},
			);
			return healthCheck;
		} catch (error) {
			this.isConnecting = false;
			this.isHealthy = false;
			this.consecutiveFailures += 1;
			if (error.code === chatCodes.TOKEN_EXPIRED && !this.tokenManager.isStatic()) {
				this.logger(
					'info',
					'connection:connect() - WS failure due to expired token, so going to try to reload token and reconnect',
					{
						tags: ['connection'],
					},
				);
				return this._reconnect({ refreshToken: true });
			}

			if (!error.isWSFailure) {
				// This is a permanent failure, throw the error...
				// We are keeping the error consistent with http error.
				throw new Error(
					JSON.stringify({
						code: error.code,
						StatusCode: error.StatusCode,
						message: error.message,
						isWSFailure: error.isWSFailure,
					}),
				);
			}
		}
	}

	_buildUrl = () => {
		const params = {
			user_id: this.user.id,
			user_details: this.user,
			user_token: this.tokenManager.getToken(),
			server_determines_connection_id: true,
		};
		const qs = encodeURIComponent(JSON.stringify(params));
		const token = this.tokenManager.getToken();
		return `${this.wsBaseURL}/connect?json=${qs}&api_key=${this.apiKey}&authorization=${token}&stream-auth-type=${this.authType}&x-stream-client=${this.userAgent}`;
	};

	/**
	 * disconnect - Disconnect the connection and doesn't recover...
	 *
	 */
	disconnect(timeout) {
		this.logger(
			'info',
			`connection:disconnect() - Closing the websocket connection for wsID ${this.wsID}`,
			{
				tags: ['connection'],
			},
		);

		this.wsID += 1;

		// start by removing all the listeners
		if (this.healthCheckIntervalRef) {
			clearInterval(this.healthCheckIntervalRef);
		}
		if (this.monitorIntervalRef) {
			clearInterval(this.monitorIntervalRef);
		}

		this._removeConnectionListeners();

		this.isHealthy = false;

		// remove ws handlers...
		if (this.ws && this.ws.removeAllListeners) {
			this.ws.removeAllListeners();
		}

		let isClosedPromise;
		// and finally close...
		// Assigning to local here because we will remove it from this before the
		// promise resolves.
		const { ws } = this;
		if (ws && ws.close && ws.readyState === ws.OPEN) {
			isClosedPromise = new Promise(resolve => {
				const onclose = event => {
					this.logger(
						'info',
						`connection:disconnect() - resolving isClosedPromise ${
							event ? 'with' : 'without'
						} close frame`,
						{
							tags: ['connection'],
							event,
						},
					);
					resolve();
				};

				ws.onclose = onclose;
				// In case we don't receive close frame websocket server in time,
				// lets not wait for more than 1 seconds.
				setTimeout(onclose, timeout != null ? timeout : 1000);
			});

			this.logger(
				'info',
				`connection:disconnect() - Manually closed connection by calling client.disconnect()`,
				{
					tags: ['connection'],
				},
			);

			ws.close(
				chatCodes.WS_CLOSED_SUCCESS,
				'Manually closed connection by calling client.disconnect()',
			);
		} else {
			this.logger(
				'info',
				`connection:disconnect() - ws connection doesn't exist or it is already closed.`,
				{
					tags: ['connection'],
				},
			);
			isClosedPromise = Promise.resolve();
		}

		delete this.ws;

		return isClosedPromise;
	}

	/**
	 * _connect - Connect to the WS endpoint
	 *
	 * @return {promise} Promise that completes once the first health check message is received
	 */
	async _connect() {
		await this.tokenManager.tokenReady();
		this._setupConnectionPromise();
		const wsURL = this._buildUrl();
		this.ws = new isoWS(wsURL);
		this.ws.onopen = this.onopen.bind(this, this.wsID);
		this.ws.onclose = this.onclose.bind(this, this.wsID);
		this.ws.onerror = this.onerror.bind(this, this.wsID);
		this.ws.onmessage = this.onmessage.bind(this, this.wsID);
		const response = await this.connectionOpen;

		this.connectionID = response.connection_id;

		return response;
	}

	/**
	 * _reconnect - Retry the connection to WS endpoint
	 *
	 * @param {object} options Following options are available
	 *
	 * - `interval`	{int}			number of ms that function should wait before reconnecting
	 * - `refreshToken` {boolean}	reload/refresh user token be refreshed before attempting reconnection.
	 */
	async _reconnect(options = {}) {
		this.logger('info', 'connection:_reconnect() - Initiating the reconnect', {
			tags: ['connection'],
		});
		// only allow 1 connection at the time
		if (this.isConnecting || this.isHealthy) {
			this.logger(
				'info',
				'connection:_reconnect() - Abort (1) since already connecting or healthy',
				{
					tags: ['connection'],
				},
			);
			return;
		}

		// reconnect in case of on error or on close
		// also reconnect if the health check cycle fails
		let interval = options.interval;
		if (!interval) {
			interval = this._retryInterval();
		}
		// reconnect, or try again after a little while...
		await sleep(interval);

		// Check once again if by some other call to _reconnect is active or connection is
		// already restored, then no need to proceed.
		if (this.isConnecting || this.isHealthy) {
			this.logger(
				'info',
				'connection:_reconnect() - Abort (2) since already connecting or healthy',
				{
					tags: ['connection'],
				},
			);
			return;
		}

		this.isConnecting = true;

		// cleanup the old connection
		this.logger(
			'info',
			'connection:_reconnect() - Destroying current WS connection',
			{
				tags: ['connection'],
			},
		);

		this._destroyCurrentWSConnection();

		if (options.refreshToken) {
			await this.tokenManager.loadToken();
		}

		try {
			const open = await this._connect();
			if (this.recoverCallback) {
				this.logger(
					'info',
					'connection:_reconnect() - Waiting for recoverCallBack',
					{
						tags: ['connection'],
					},
				);
				await this.recoverCallback(open);
				this.logger(
					'info',
					'connection:_reconnect() - Finished recoverCallBack',
					{
						tags: ['connection'],
					},
				);
			}
			this.isConnecting = false;
			this.consecutiveFailures = 0;
		} catch (error) {
			this.isConnecting = false;
			this.isHealthy = false;
			this.consecutiveFailures += 1;
			if (error.code === chatCodes.TOKEN_EXPIRED && !this.tokenManager.isStatic()) {
				this.logger(
					'info',
					'connection:_reconnect() - WS failure due to expired token, so going to try to reload token and reconnect',
					{
						tags: ['connection'],
					},
				);

				return this._reconnect({ refreshToken: true });
			}

			// reconnect on WS failures, dont reconnect if there is a code bug
			if (error.isWSFailure) {
				this.logger(
					'info',
					'connection:_reconnect() - WS failure, so going to try to reconnect',
					{
						tags: ['connection'],
					},
				);

				this._reconnect();
			}
		}
		this.logger('info', 'connection:_reconnect() - == END ==', {
			tags: ['connection'],
		});
	}

	/**
	 * onlineStatusChanged - this function is called when the browser connects or disconnects from the internet.
	 *
	 * @param {object} event Event with type online or offline
	 *
	 */
	onlineStatusChanged = event => {
		if (event.type === 'offline') {
			// mark the connection as down
			this.logger(
				'info',
				'connection:onlineStatusChanged() - Status changing to offline',
				{
					tags: ['connection'],
				},
			);
			this._setHealth(false);
		} else if (event.type === 'online') {
			// retry right now...
			// We check this.isHealthy, not sure if it's always
			// smart to create a new WS connection if the old one is still up and running.
			// it's possible we didnt miss any messages, so this process is just expensive and not needed.
			this.logger(
				'info',
				`connection:onlineStatusChanged() - Status changing to online. isHealthy: ${this.isHealthy}`,
				{
					tags: ['connection'],
				},
			);
			if (!this.isHealthy) {
				this._reconnect({ interval: 10 });
			}
		}
	};

	onopen = wsID => {
		if (this.wsID !== wsID) return;
		this.logger('info', 'connection:onopen() - onopen callback', {
			tags: ['connection'],
			wsID,
		});

		// set healthy..
		this._setHealth(true);
	};

	onmessage = (wsID, event) => {
		if (this.wsID !== wsID) return;

		// we wait till the first message before we consider the connection open..
		// the reason for this is that auth errors and similar errors trigger a ws.onopen and immediately
		// after that a ws.onclose..
		if (!this.isResolved) {
			const data = JSON.parse(event.data);
			if (data.error != null) {
				this.rejectPromise(this._errorFromWSEvent(data.error, false));
				return;
			} else {
				this.resolvePromise(event);
			}
		}

		// trigger the event..
		this.lastEvent = new Date();
		this.logger('info', 'connection:onmessage() - onmessage callback', {
			tags: ['connection'],
			event,
			wsID,
		});

		this.messageCallback(event);
	};

	onclose = (wsID, event) => {
		this.logger('info', 'connection:onclose() - onclose callback - ' + event.code, {
			tags: ['connection'],
			event,
			wsID,
		});

		if (this.wsID !== wsID) return;

		if (event.code === chatCodes.WS_CLOSED_SUCCESS) {
			// this is a permanent error raised by stream..
			// usually caused by invalid auth details
			const error = new Error(`WS connection reject with error ${event.reason}`);
			error.reason = event.reason;
			this.rejectPromise(error);
			this.logger(
				'info',
				`connection:onclose() - WS connection reject with error ${event.reason}`,
				{
					tags: ['connection'],
					event,
				},
			);
		} else {
			this.consecutiveFailures += 1;
			this.totalFailures += 1;
			this._setHealth(false);

			this.rejectPromise(this._errorFromWSEvent(event));

			this.logger(
				'info',
				`connection:onclose() - WS connection closed. Calling reconnect ...`,
				{
					tags: ['connection'],
					event,
				},
			);

			// reconnect if its an abnormal failure
			this._reconnect();
		}
	};

	onerror = (wsID, event) => {
		if (this.wsID !== wsID) return;

		this.consecutiveFailures += 1;
		this.totalFailures += 1;
		this._setHealth(false);

		this.rejectPromise(this._errorFromWSEvent(event));
		this.logger('info', `connection:onerror() - WS connection resulted into error`, {
			tags: ['connection'],
			event,
		});

		this._reconnect();
	};

	/**
	 * _setHealth - Sets the connection to healthy or unhealthy.
	 * Broadcasts an event in case the connection status changed.
	 *
	 * @param {bool} healthy boolean indicating if the connection is healthy or not
	 *
	 */
	_setHealth = healthy => {
		if (healthy && !this.isHealthy) {
			// yee we are online:
			this.isHealthy = true;
			this.eventCallback({
				type: 'connection.changed',
				online: true,
			});
		}

		if (!healthy && this.isHealthy) {
			// bummer we are offline
			this.isHealthy = false;
			setTimeout(() => {
				if (!this.isHealthy) {
					this.eventCallback({
						type: 'connection.changed',
						online: false,
					});
				}
			}, 5000);
		}
	};

	/**
	 * _errorFromWSEvent - Creates an error object for the WS event
	 *
	 */
	_errorFromWSEvent = (event, isWSFailure = true) => {
		this.logger(
			'error',
			`connection:_errorFromWSEvent() - WS failed with code ${event.code}`,
			{
				tags: ['connection'],
				event,
			},
		);

		const error = new Error(
			`WS failed with code ${event.code} and reason - ${event.message}`,
		);
		error.code = event.code;
		error.StatusCode = event.StatusCode;
		error.isWSFailure = isWSFailure;
		return error;
	};

	/**
	 * _listenForConnectionChanges - Adds an event listener for the browser going online or offline
	 *
	 */
	_listenForConnectionChanges = () => {
		if (
			typeof window !== 'undefined' &&
			window != null &&
			window.addEventListener != null
		) {
			window.addEventListener('offline', this.onlineStatusChanged);
			window.addEventListener('online', this.onlineStatusChanged);
		}
	};

	_removeConnectionListeners = () => {
		if (
			typeof window !== 'undefined' &&
			window != null &&
			window.addEventListener != null
		) {
			window.removeEventListener('offline', this.onlineStatusChanged);
			window.removeEventListener('online', this.onlineStatusChanged);
		}
	};

	/**
	 * _destroyCurrentWSConnection - Removes the current WS connnection
	 *
	 */
	_destroyCurrentWSConnection() {
		// increment the ID, meaning we will ignore all messages from the old
		// ws connection from now on.
		this.wsID += 1;

		try {
			if (this.ws && this.ws.removeAllListeners) {
				this.ws.removeAllListeners();
			}

			if (this.ws && this.ws.close) {
				this.ws.close();
			}
		} catch (e) {
			// we dont care
		}
	}

	/**
	 * _retryInterval - A retry interval which increases after consecutive failures
	 *
	 * @return {int} Duration to wait in milliseconds
	 */
	_retryInterval = () => {
		// try to reconnect in 0-5 seconds (random to spread out the load from failures)
		const max = Math.min(500 + this.consecutiveFailures * 2000, 25000);
		const min = Math.min(Math.max(250, (this.consecutiveFailures - 1) * 2000), 25000);
		return Math.floor(Math.random() * (max - min) + min);
	};

	/**
	 * _setupPromise - sets up the this.connectOpen promise
	 */
	_setupConnectionPromise = () => {
		const that = this;
		this.isResolved = false;
		/** a promise that is resolved once ws.open is called */
		this.connectionOpen = new Promise(function(resolve, reject) {
			that.resolvePromise = resolve;
			that.rejectPromise = reject;
		}).then(
			e => {
				const data = JSON.parse(e.data);
				if (data.error != null) {
					throw new Error(JSON.stringify(data.error));
				}
				return data;
			},
			error => {
				throw error;
			},
		);
	};

	/**
	 * _startHealthCheck - Sends a message every 30s or so to see if the ws connection still works
	 *
	 */
	_startHealthCheck() {
		const that = this;
		// 30 seconds is the recommended interval (messenger uses this)
		this.healthCheckIntervalRef = setInterval(() => {
			// send the healthcheck.., server replies with a health check event
			const data = [
				{
					type: 'health.check',
					client_id: that.clientID,
					user_id: that.userID,
				},
			];
			// try to send on the connection
			try {
				that.ws.send(JSON.stringify(data));
			} catch (e) {
				// error will already be detected elsewhere
			}
		}, that.healthCheckInterval);
	}

	/**
	 * _startMonitor - Verifies we didn't miss any events. Marks the connection as failed in case we did.
	 *
	 */
	_startMonitor() {
		const that = this;
		this.monitorIntervalRef = setInterval(() => {
			const now = new Date();
			// means we missed a health check
			if (now - that.lastEvent > this.healthCheckInterval + 10 * 1000) {
				this.logger('info', 'connection:_startMonitor - going to reconnect', {
					tags: ['connection'],
				});
				that._setHealth(false);
				that._reconnect();
			}
		}, that.monitorInterval);
	}
}
