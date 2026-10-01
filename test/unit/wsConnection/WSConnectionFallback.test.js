import sinon from 'sinon';
import axios, { CanceledError } from 'axios';

import * as utils from '../../../src/utils';
import * as errors from '../../../src/errors';
import { ConnectionIdManager } from '../../../src/connection/ConnectionIdManager';
import {
	WSFallbackConnectionState,
	WSConnectionFallback,
} from '../../../src/connection/wsConnection/WSConnectionFallback';

import { describe, it, expect, afterEach, vi, beforeAll, beforeEach } from 'vitest';

describe('WSConnectionFallback', () => {
	const newClient = (overrides) => ({
		longPoll: sinon.spy(),
		_buildWSAuthPayload: sinon.stub().returns('payload'),
		dispatchEvent: sinon.spy(),
		_settleConnectPromises: sinon.spy(),
		_markActiveChannelsWatchInterrupted: sinon.spy(),
		connectionIdManager: new ConnectionIdManager(),
		wsConnection: {
			isHealthy: false,
			// Like the real one: reports whether the status changed.
			_setStatus: sinon.spy(function ({ isHealthy }) {
				if (this.isHealthy === isHealthy) return false;
				this.isHealthy = isHealthy;
				return true;
			}),
		},
		...overrides,
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('constructor', () => {
		it('should set the state correctly', () => {
			const client = newClient();
			const c = new WSConnectionFallback({ client });

			expect(c.client).to.be.eql(client);
			expect(c.state).to.be.eql(WSFallbackConnectionState.Init);
			expect(c.consecutiveFailures).to.be.eql(0);
		});
	});

	describe('_setState', () => {
		it('should update state correctly', function () {
			const c = new WSConnectionFallback({ client: newClient() });

			expect(c.state).to.be.eql(WSFallbackConnectionState.Init);

			c._setState(WSFallbackConnectionState.Closed);
			expect(c.state).to.be.eql(WSFallbackConnectionState.Closed);

			c._setState(WSFallbackConnectionState.Connected);
			expect(c.state).to.be.eql(WSFallbackConnectionState.Connected);

			c._setState(WSFallbackConnectionState.Connecting);
			expect(c.state).to.be.eql(WSFallbackConnectionState.Connecting);

			c._setState(WSFallbackConnectionState.Disconnected);
			expect(c.state).to.be.eql(WSFallbackConnectionState.Disconnected);
		});

		it('should report online status to wsConnection', function () {
			const client = newClient();
			const c = new WSConnectionFallback({ client });

			c._setState(WSFallbackConnectionState.Connecting);
			expect(client.wsConnection._setStatus.called).to.be.false;

			c._setState(WSFallbackConnectionState.Connected);
			expect(client.wsConnection._setStatus.calledOnceWithExactly({ isHealthy: true })).to
				.be.true;
		});

		it('should report offline status, drop the connection id and mark watches', function () {
			const client = newClient();
			const c = new WSConnectionFallback({ client });
			c._setState(WSFallbackConnectionState.Connecting);
			client.connectionIdManager.resolveConnectionId('id');
			c._setState(WSFallbackConnectionState.Connected);

			c._setState(WSFallbackConnectionState.Closed);
			expect(client.wsConnection._setStatus.lastCall.args).to.be.eql([
				{ isHealthy: false },
			]);
			expect(client.connectionIdManager.connectionId).to.be.undefined;
			expect(client._markActiveChannelsWatchInterrupted.calledOnce).to.be.true;

			// no Connecting => Connected transition, so no online status
			c._setState(WSFallbackConnectionState.Connected);
			expect(client.wsConnection.isHealthy).to.be.false;

			// already offline: nothing new to mark
			c._setState(WSFallbackConnectionState.Disconnected);
			expect(client._markActiveChannelsWatchInterrupted.calledOnce).to.be.true;
		});

		it('should already be in the new state when it reports the status', function () {
			const client = newClient();
			const c = new WSConnectionFallback({ client });
			const seen = [];
			client.wsConnection._setStatus = sinon.spy(() => seen.push(c.state));

			c._setState(WSFallbackConnectionState.Connecting);
			c._setState(WSFallbackConnectionState.Connected);
			c._setState(WSFallbackConnectionState.Closed);
			c._setState(WSFallbackConnectionState.Disconnected);
			expect(seen).to.be.eql([
				WSFallbackConnectionState.Connected,
				WSFallbackConnectionState.Closed,
				WSFallbackConnectionState.Disconnected,
			]);
		});

		it('should not be closed again by the socket-mirroring reporter on disconnect()', async function () {
			const client = newClient();
			const c = new WSConnectionFallback({ client });
			c._req = sinon.stub().resolves();
			c.state = WSFallbackConnectionState.Connected;
			client.wsConnection.isHealthy = true;
			// the reporter forwards the socket's status as the network's, which is routed back here
			const setStatus = client.wsConnection._setStatus;
			client.wsConnection._setStatus = sinon.spy(function (status) {
				const changed = setStatus.call(this, status);
				if (changed) c._applyNetworkStatus(status.isHealthy);
				return changed;
			});

			await c.disconnect();
			expect(c.state).to.be.eql(WSFallbackConnectionState.Disconnected);
			// a nested `_setState(Closed)` would have reported the status a second time
			expect(client.wsConnection._setStatus.calledOnce).to.be.true;
		});

		it('should keep a transition a status subscriber makes', async function () {
			const client = newClient();
			const c = new WSConnectionFallback({ client });
			c._req = sinon.spy(async (params) => {
				if (params.json) return { event: { connection_id: 'id' } };
				if (params.close) return;
				// a poll: stop the loop, so a regression fails instead of hanging
				c.state = WSFallbackConnectionState.Closed;
				return {};
			});
			// an integrator closing the connection as soon as it comes up
			const setStatus = client.wsConnection._setStatus;
			client.wsConnection._setStatus = sinon.spy(function (status) {
				const changed = setStatus.call(this, status);
				if (changed && status.isHealthy) c.disconnect();
				return changed;
			});

			await c.connect();
			expect(c.state).to.be.eql(WSFallbackConnectionState.Disconnected);
			// only the connect and the close: no poll on a disconnected connection
			expect(c._req.callCount).to.be.eql(2);
			expect(c._req.secondCall.args[0].close).to.be.true;
		});
	});

	describe('_applyNetworkStatus', () => {
		it('should call connect for online status in Closed state', () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c.connect = sinon.spy();
			c._applyNetworkStatus(true);
			expect(c.connect.called).to.be.false;

			c.state = WSFallbackConnectionState.Closed;
			c._applyNetworkStatus(true);
			expect(c.connect.calledOnceWithExactly(true)).to.be.true;
		});

		it('should go to Close state on offline status', () => {
			const c = new WSConnectionFallback({ client: newClient() });
			const spy = sinon.spy();
			c.abortController = { abort: spy };
			c._applyNetworkStatus(false);
			expect(c.state).to.be.eql(WSFallbackConnectionState.Closed);
			expect(spy.calledOnce).to.be.true;
			expect(c.abortController).to.be.undefined;

			c._applyNetworkStatus(false);
			expect(c.state).to.be.eql(WSFallbackConnectionState.Closed);
			expect(c.abortController).to.be.undefined;
		});
	});

	describe('isConnecting', () => {
		it('is true only in Connecting state', () => {
			const c = new WSConnectionFallback({ client: newClient() });
			expect(c.isConnecting).to.be.false;

			for (const state of Object.values(WSFallbackConnectionState)) {
				c.state = state;
				expect(c.isConnecting).to.be.eql(state === WSFallbackConnectionState.Connecting);
			}
		});

		it('is true while the connect request is pending', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			let respond;
			c._req = () => new Promise((resolve) => (respond = resolve));
			c._poll = sinon.spy();

			const connecting = c.connect();
			expect(c.isConnecting).to.be.true;

			respond({ event: { connection_id: 'id' } });
			await connecting;
			expect(c.isConnecting).to.be.false;
		});
	});

	describe('disconnect', () => {
		it('should ignore network status until it connects again', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c._req = () => null;
			await c.disconnect();
			c.connect = sinon.spy();

			// going offline would otherwise move it to Closed, and back online reconnect it
			c._applyNetworkStatus(false);
			c._applyNetworkStatus(true);
			expect(c.state).to.be.eql(WSFallbackConnectionState.Disconnected);
			expect(c.connect.called).to.be.false;

			c.state = WSFallbackConnectionState.Connected;
			c._applyNetworkStatus(false);
			expect(c.state).to.be.eql(WSFallbackConnectionState.Closed);
		});

		it('should cancel requests and set the state correctly', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.spy();
			const connection_id = 'id';
			const abort = sinon.spy();
			c.abortController = { abort };
			const timeout = 500;
			await c.disconnect(timeout, connection_id);

			expect(c.state).to.be.eql(WSFallbackConnectionState.Disconnected);
			expect(c.abortController).to.be.undefined;
			expect(abort.calledOnce).to.be.true;
			expect(
				c._req.calledOnceWithExactly({ close: true, connection_id }, { timeout }, false),
			).to.be.true;
		});

		it('should ingore request errors', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c._req = () => Promise.reject('error');
			await c.disconnect();
		});
	});

	describe('_req', () => {
		it('should set abort controller', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			expect(c.abortController).to.be.undefined;
			await c._req({}, {});
			expect(c.abortController).to.be.instanceOf(AbortController);

			c.abortController = undefined;
			await c._req({ close: true }, {});
			expect(c.abortController).to.be.undefined;
		});

		it('should send the request correctly', async () => {
			const c = new WSConnectionFallback({ client: newClient() });

			const params = { json: 'hi' };
			const config = { timeout: 100 };
			await c._req(params, config);
			expect(
				c.client.longPoll.calledOnceWithExactly(params, {
					...config,
					signal: c.abortController.signal,
				}),
			).to.be.true;
		});

		it('should abort the request in flight when going offline', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			await c._req({}, {});
			const [, { signal }] = c.client.longPoll.lastCall.args;

			c._applyNetworkStatus(false);
			expect(signal.aborted).to.be.true;
		});

		it('should keep track of consecutive failures', async () => {
			// ok-err-err-ok-ok...
			const longPoll = vi
				.fn()
				.mockResolvedValueOnce()
				.mockRejectedValueOnce()
				.mockRejectedValueOnce()
				.mockResolvedValue();
			const c = new WSConnectionFallback({
				client: newClient({ longPoll }),
			});

			expect(c.consecutiveFailures).toBe(0);
			await c._req({});
			expect(c.consecutiveFailures).toBe(0);
			await expect(c._req({})).rejects.toThrow();
			expect(c.consecutiveFailures).toBe(1);
			await expect(c._req({})).rejects.toThrow();
			expect(c.consecutiveFailures).toBe(2);
			await c._req({});
			expect(c.consecutiveFailures).toBe(0);
			await c._req({});
			expect(c.consecutiveFailures).toBe(0);
		});

		it('should not retry for non-retryable errors', async () => {
			const longPoll = sinon.stub().rejects();
			sinon.stub(errors, 'isErrorRetryable').returns(false);
			const c = new WSConnectionFallback({
				client: newClient({ longPoll }),
			});
			sinon.spy(c);

			expect(c.consecutiveFailures).to.be.eql(0);
			await expect(c._req({}, {}, true)).rejects.toThrow();
			expect(c.consecutiveFailures).to.be.eql(1);
			expect(c._req.calledOnce).to.be.true;
		});

		it('should not retry when retry flag is false', async () => {
			const longPoll = sinon.stub().rejects();
			sinon.stub(errors, 'isErrorRetryable').returns(true);
			const c = new WSConnectionFallback({
				client: newClient({ longPoll }),
			});
			sinon.spy(c);

			expect(c.consecutiveFailures).to.be.eql(0);
			await expect(c._req({}, {}, false)).rejects.toThrow();
			expect(c.consecutiveFailures).to.be.eql(1);
			expect(c._req.calledOnce).to.be.true;
		});

		it('should retry errors if it is retryable', async () => {
			const longPoll = sinon.stub().rejects();

			vi.spyOn(errors, 'isErrorRetryable')
				.mockReturnValueOnce(true)
				.mockReturnValueOnce(true)
				.mockReturnValueOnce(false);

			vi.spyOn(utils, 'sleep').mockResolvedValue();

			const c = new WSConnectionFallback({
				client: newClient({ longPoll }),
			});
			sinon.spy(c, '_req');

			expect(c.consecutiveFailures).to.be.eql(0);
			await expect(c._req({}, {}, true)).rejects.toThrow();
			expect(c.consecutiveFailures).to.be.eql(3);
			expect(c._req.calledThrice).to.be.true;
		});

		it('should drop a retry whose connection id changed while it waited', async () => {
			const longPoll = sinon.stub().rejects();
			// once, so a retry that is not dropped fails instead of looping
			vi.spyOn(errors, 'isErrorRetryable').mockReturnValueOnce(true);
			const c = new WSConnectionFallback({ client: newClient({ longPoll }) });
			c.client.connectionIdManager.resolveConnectionId('old');
			// a reconnect lands while the retry sleeps
			vi.spyOn(utils, 'sleep').mockImplementation(async () => {
				c.client.connectionIdManager.invalidate();
				c.client.connectionIdManager.resolveConnectionId('new');
			});

			const error = await c._req({ connection_id: 'old' }, {}, true).catch((e) => e);
			expect(axios.isCancel(error)).to.be.true;
			expect(longPoll.calledOnce).to.be.true;
		});

		it('should drop a retry whose connection id disconnect() dropped while it waited', async () => {
			const longPoll = sinon.stub().rejects();
			vi.spyOn(errors, 'isErrorRetryable').mockReturnValueOnce(true);
			const c = new WSConnectionFallback({ client: newClient({ longPoll }) });
			c.client.connectionIdManager.resolveConnectionId('old');
			vi.spyOn(utils, 'sleep').mockImplementation(async () => {
				c.client.connectionIdManager.invalidate();
			});

			const error = await c._req({ connection_id: 'old' }, {}, true).catch((e) => e);
			expect(axios.isCancel(error)).to.be.true;
			expect(longPoll.calledOnce).to.be.true;
		});

		it('should drop a retry whose connection went offline while it waited', async () => {
			const longPoll = sinon.stub().rejects();
			vi.spyOn(errors, 'isErrorRetryable').mockReturnValueOnce(true);
			const c = new WSConnectionFallback({ client: newClient({ longPoll }) });
			c.client.connectionIdManager.resolveConnectionId('old');
			c.state = WSFallbackConnectionState.Connected;
			vi.spyOn(utils, 'sleep').mockImplementation(async () => {
				c._applyNetworkStatus(false);
			});

			const error = await c._req({ connection_id: 'old' }, {}, true).catch((e) => e);
			expect(c.state).to.be.eql(WSFallbackConnectionState.Closed);
			expect(axios.isCancel(error)).to.be.true;
			expect(longPoll.calledOnce).to.be.true;
		});

		it('should retry with the same connection id while it is still current', async () => {
			const longPoll = sinon.stub();
			longPoll.onFirstCall().rejects();
			longPoll.resolves({ events: [] });
			vi.spyOn(errors, 'isErrorRetryable').mockReturnValue(true);
			vi.spyOn(utils, 'sleep').mockResolvedValue();
			const c = new WSConnectionFallback({ client: newClient({ longPoll }) });
			c.client.connectionIdManager.resolveConnectionId('id');

			await c._req({ connection_id: 'id' }, {}, true);
			expect(longPoll.calledTwice).to.be.true;
			expect(longPoll.secondCall.args[0]).to.be.eql({ connection_id: 'id' });
		});
	});

	describe('connect', () => {
		const health = { connection_id: 'connectionID' };
		it('should skip connect if already connecting or connected', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			sinon.spy(c);
			c.state = WSFallbackConnectionState.Connecting;
			expect(await c.connect()).to.be.undefined;
			c.state = WSFallbackConnectionState.Connected;
			expect(await c.connect()).to.be.undefined;
			expect(c._setState.called).to.be.false;
			expect(c._req.called).to.be.false;
		});

		it('should send request in correct format', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().resolves({ event: health });
			c._poll = sinon.spy();

			expect(await c.connect()).to.be.eql(health);
			// authenticated by the Authorization header, so the message carries no token
			expect(c.client._buildWSAuthPayload.calledOnceWithExactly()).to.be.true;
			expect(c._poll.calledOnce).to.be.true;
			expect(c._req.calledOnceWithExactly({ json: 'payload' }, { timeout: 8000 }, false))
				.to.be.true;

			c.state = WSFallbackConnectionState.Init;
			c._req = sinon.stub().resolves({ event: health });
			expect(await c.connect(true)).to.be.eql(health);
			expect(c._req.calledOnceWithExactly({ json: 'payload' }, { timeout: 8000 }, true))
				.to.be.true;
		});

		it('should update state and the connection id', async () => {
			let c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().resolves({ event: health });
			c._poll = sinon.spy();
			expect(await c.connect()).to.be.eql(health);
			expect(c.state).to.be.eql(WSFallbackConnectionState.Connected);
			expect(c.client.connectionIdManager.connectionId).to.be.eql(health.connection_id);

			c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().rejects();
			c._poll = sinon.spy();
			await expect(c.connect()).rejects.toThrow();
			expect(c._poll.called).to.be.false;
			expect(c.state).to.be.eql(WSFallbackConnectionState.Closed);
			expect(c.client.connectionIdManager.connectionId).to.be.undefined;
		});

		it('should only start polling after connect', async () => {
			let c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().resolves({ event: health });
			c._poll = sinon.spy();
			expect(await c.connect()).to.be.eql(health);
			expect(c._poll.calledOnce).to.be.true;

			c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().rejects();
			c._poll = sinon.spy();
			await expect(c.connect()).rejects.toThrow();
			expect(c._poll.called).to.be.false;
		});

		it('should settle the connect promises on reconnect only', async () => {
			let c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().resolves({ event: health });
			c._poll = sinon.spy();
			await c.connect();
			expect(c.client._settleConnectPromises.called).to.be.false;

			c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().rejects();
			c._poll = sinon.spy();
			await expect(c.connect()).rejects.toThrow();
			expect(c.client._settleConnectPromises.called).to.be.false;

			c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().resolves({ event: health });
			c._poll = sinon.spy();
			await c.connect(true);
			expect(c.client._settleConnectPromises.called).to.be.true;
		});

		it('should make a watch issued meanwhile wait for its connection id', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			let respond;
			c._req = () => new Promise((resolve) => (respond = resolve));
			c._poll = sinon.spy();

			const connecting = c.connect();
			const waiter = c.client.connectionIdManager.getConnectionId();
			respond({ event: health });
			await connecting;
			await expect(waiter).resolves.toBe(health.connection_id);
		});

		it('should fail whatever waits for an id when connect fails, but not when cancelled', async () => {
			let c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().rejects(new Error('boom'));
			let connecting = c.connect();
			let waiter = c.client.connectionIdManager.getConnectionId();
			await expect(connecting).rejects.toThrow('boom');
			await expect(waiter).rejects.toThrow('boom');

			c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().rejects(new CanceledError());
			connecting = c.connect();
			waiter = c.client.connectionIdManager.getConnectionId();
			await expect(connecting).rejects.toThrow();
			expect(c.client.connectionIdManager.loadConnectionIdPromise).to.be.equal(waiter);
		});

		it('should stay Disconnected when disconnect() cancels it', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			let cancel;
			c._req = (params) =>
				params.close
					? Promise.resolve()
					: new Promise((_, reject) => (cancel = () => reject(new CanceledError())));

			const connecting = c.connect();
			await c.disconnect();
			cancel();
			await expect(connecting).rejects.toThrow();
			expect(c.state).to.be.eql(WSFallbackConnectionState.Disconnected);

			// so the next online edge does not reconnect it
			c.connect = sinon.spy();
			c._applyNetworkStatus(false);
			c._applyNetworkStatus(true);
			expect(c.connect.called).to.be.false;
		});
	});

	describe('_poll', () => {
		it('should do nothing if not in connect state', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.spy();
			expect(await c._poll()).to.be.undefined;
			expect(c._req.called).to.be.false;

			c.state = WSFallbackConnectionState.Connecting;
			expect(await c._poll()).to.be.undefined;
			expect(c._req.called).to.be.false;
		});

		it('should send request in correct format', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c.state = WSFallbackConnectionState.Connected;
			c.client.connectionIdManager.resolveConnectionId('id');
			c._req = async () => {
				c.state = WSFallbackConnectionState.Closed;
				return {};
			};
			sinon.spy(c, '_req');
			await c._poll();
			expect(
				c._req.calledOnceWithExactly({ connection_id: 'id' }, { timeout: 30000 }, true),
			).to.be.true;
		});

		it('should dispatch incoming events', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c.state = WSFallbackConnectionState.Connected;

			c._req = async () => {
				c.state = WSFallbackConnectionState.Closed;
				return { events: ['1', '2'] };
			};
			await c._poll();
			expect(c.client.dispatchEvent.calledTwice).to.be.true;
			expect(c.client.dispatchEvent.getCall(0).args).to.be.eql(['1']);
			expect(c.client.dispatchEvent.getCall(1).args).to.be.eql(['2']);
		});

		it('should reconnect if ConnectionID err', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c.state = WSFallbackConnectionState.Connected;
			c.connect = sinon.spy();
			c._req = async () => {
				const err = new Error();
				err.code = 46;
				throw err;
			};

			await c._poll();
			expect(c.state).to.be.eql(WSFallbackConnectionState.Disconnected);
			expect(c.connect.calledOnceWithExactly(true)).to.be.true;
		});

		it('should stop for non-retryable errors', async () => {
			vi.spyOn(errors, 'isErrorRetryable').mockReturnValue(false);
			vi.spyOn(errors, 'isAPIError').mockReturnValue(true);
			const c = new WSConnectionFallback({ client: newClient() });
			c.state = WSFallbackConnectionState.Connected;
			c.client.connectionIdManager.resolveConnectionId('id');
			c._req = sinon.stub().rejects(new Error('stop'));

			await c._poll();
			expect(c.state).to.be.eql(WSFallbackConnectionState.Closed);
			// nothing reconnects from here, so nothing may wait for an id
			expect(() => c.client.connectionIdManager.getConnectionId()).toThrow();
		});

		it('should continue retrying for random errors', async () => {
			let counter = 0;
			vi.spyOn(utils, 'sleep').mockImplementation(() => {
				if (++counter > 2) c.state = WSFallbackConnectionState.Disconnected;
			});
			const c = new WSConnectionFallback({ client: newClient() });
			c.state = WSFallbackConnectionState.Connected;
			c._req = sinon.stub().rejects();

			await c._poll();
			expect(c._req.calledThrice).to.be.true;
			expect(utils.sleep).toHaveBeenCalledTimes(3);
		});
	});
});
