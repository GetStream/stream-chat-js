import chai from 'chai';
import sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';

import * as utils from '../../src/utils';
import * as errors from '../../src/errors';
import { ConnectionState, WSConnectionFallback } from '../../src/connection_fallback';

chai.use(chaiAsPromised);
const expect = chai.expect;

describe('connection_fallback', () => {
	const newClient = (overrides) => ({
		baseURL: '',
		logger: () => null,
		doAxiosRequest: sinon.spy(),
		_buildWSPayload: sinon.stub().returns('payload'),
		dispatchEvent: sinon.spy(),
		handleEvent: sinon.spy(),
		recoverState: sinon.spy(),
		...overrides,
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('constructor', () => {
		it('should set the state correctly', () => {
			const client = newClient();
			const c = new WSConnectionFallback({ client });

			expect(c.client).to.be.eql(client);
			expect(c.state).to.be.eql(ConnectionState.Init);
			expect(c.consecutiveFailures).to.be.eql(0);
		});

		it('should register window event listeners', () => {
			sinon.spy(utils, 'addConnectionEventListeners');
			const c = new WSConnectionFallback({ client: newClient() });
			expect(utils.addConnectionEventListeners.calledOnceWithExactly(c._onlineStatusChanged)).to.be.true;
			sinon.restore();
		});
	});

	describe('_setState', () => {
		it('should update state correctly', function () {
			const c = new WSConnectionFallback({ client: newClient() });

			expect(c.state).to.be.eql(ConnectionState.Init);

			c._setState(ConnectionState.Closed);
			expect(c.state).to.be.eql(ConnectionState.Closed);

			c._setState(ConnectionState.Connected);
			expect(c.state).to.be.eql(ConnectionState.Connected);

			c._setState(ConnectionState.Connecting);
			expect(c.state).to.be.eql(ConnectionState.Connecting);

			c._setState(ConnectionState.Disconnected);
			expect(c.state).to.be.eql(ConnectionState.Disconnected);
		});

		it('should dispatchEvent for online status', function () {
			const client = newClient();
			const c = new WSConnectionFallback({ client });
			expect(client.dispatchEvent.called).to.be.false;

			c._setState(ConnectionState.Connecting);
			expect(client.dispatchEvent.called).to.be.false;

			c._setState(ConnectionState.Connected);
			expect(client.dispatchEvent.calledOnceWithExactly({ type: 'connection.changed', online: true })).to.be.true;
		});

		it('should dispatchEvent for offline status', function () {
			const client = newClient();
			const c = new WSConnectionFallback({ client });
			expect(client.dispatchEvent.called).to.be.false;

			c._setState(ConnectionState.Closed);
			expect(client.dispatchEvent.calledOnceWithExactly({ type: 'connection.changed', online: false })).to.be
				.true;

			c._setState(ConnectionState.Connected);
			expect(client.dispatchEvent.calledOnce).to.be.true;

			c._setState(ConnectionState.Disconnected);
			expect(client.dispatchEvent.calledTwice).to.be.true;

			expect(client.dispatchEvent.alwaysCalledWithExactly({ type: 'connection.changed', online: false })).to.be
				.true;
		});
	});

	describe('_onlineStatusChanged,', () => {
		it('should call connect for online event an Closed state', () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c.connect = sinon.spy();
			c._onlineStatusChanged({ type: 'online' });
			expect(c.connect.called).to.be.false;

			c.state = ConnectionState.Closed;
			c._onlineStatusChanged({ type: 'online' });
			expect(c.connect.calledOnceWithExactly(true)).to.be.true;
		});

		it('should go to Close state on offline event', () => {
			const c = new WSConnectionFallback({ client: newClient() });
			const spy = sinon.spy();
			c.cancelToken = { cancel: spy };
			c._onlineStatusChanged({ type: 'offline' });
			expect(c.state).to.be.eql(ConnectionState.Closed);
			expect(spy.calledOnce).to.be.true;
			expect(c.cancelToken).to.be.undefined;

			c._onlineStatusChanged({ type: 'offline' });
			expect(c.state).to.be.eql(ConnectionState.Closed);
			expect(c.cancelToken).to.be.undefined;
		});
	});

	describe('isHealthy', () => {
		const c = new WSConnectionFallback({ client: newClient() });
		it('return undefined by default', () => {
			expect(c.isHealthy()).to.be.false;
		});
		it('return false with no id', () => {
			c.connectionID = '';
			c.state = ConnectionState.Connected;
			expect(c.isHealthy()).to.be.false;
		});
		it('return false with invalid state', () => {
			c.connectionID = 'id';
			c.state = ConnectionState.Disconnected;
			expect(c.isHealthy()).to.be.false;
			c.state = ConnectionState.Closed;
			expect(c.isHealthy()).to.be.false;
			c.state = ConnectionState.Connecting;
			expect(c.isHealthy()).to.be.false;
		});
		it('return true for ID and correct state', () => {
			c.connectionID = 'id';
			c.state = ConnectionState.Connected;
			expect(c.isHealthy()).to.be.true;
		});
	});

	describe('disconnect', () => {
		it('should unregister window event listeners', async () => {
			sinon.spy(utils, 'removeConnectionEventListeners');
			const c = new WSConnectionFallback({ client: newClient() });
			c._req = () => null;
			await c.disconnect();
			expect(utils.removeConnectionEventListeners.calledOnceWithExactly(c._onlineStatusChanged)).to.be.true;
			sinon.restore();
		});

		it('should cancel requests and set the state correctly', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.spy();
			const connection_id = 'id';
			c.connectionID = connection_id;
			const cancel = sinon.spy();
			c.cancelToken = { cancel };
			const timeout = 500;
			await c.disconnect(timeout);

			expect(c.state).to.be.eql(ConnectionState.Disconnected);
			expect(c.connectionID).to.be.undefined;
			expect(c.cancelToken).to.be.undefined;
			expect(cancel.calledOnce).to.be.true;
			expect(c._req.calledOnceWithExactly({ close: true, connection_id }, { timeout }, false)).to.be.true;
		});

		it('should ingore request errors', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c._req = () => Promise.reject('error');
			await c.disconnect();
		});
	});

	describe('_req', () => {
		it('should set cancel token', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			expect(c.cancelToken).to.be.undefined;
			await c._req({}, {});
			expect(c.cancelToken).to.not.be.undefined;
			expect(c.cancelToken.cancel).to.be.a('function');

			c.cancelToken = undefined;
			await c._req({ close: true }, {});
			expect(c.cancelToken).to.be.undefined;
		});

		it('should send the request correctly', async () => {
			const c = new WSConnectionFallback({ client: newClient() });

			const params = { json: 'hi' };
			const config = { timeout: 100 };
			await c._req(params, config);
			expect(
				c.client.doAxiosRequest.calledOnceWithExactly('get', '/longpoll', undefined, {
					params,
					config: { ...config, cancelToken: c.cancelToken.token },
				}),
			).to.be.true;
		});

		it('should keep track of consecutive failures', async () => {
			// ok-err-err-ok-ok...
			const doAxiosRequest = sinon.stub().onCall(0).resolves().onCall(1).rejects().onCall(2).rejects().resolves();
			const c = new WSConnectionFallback({ client: newClient({ doAxiosRequest }) });

			expect(c.consecutiveFailures).to.be.eql(0);
			await c._req({});
			expect(c.consecutiveFailures).to.be.eql(0);
			await expect(c._req({})).to.throw;
			expect(c.consecutiveFailures).to.be.eql(1);
			await expect(c._req({})).to.throw;
			expect(c.consecutiveFailures).to.be.eql(2);
			await c._req({});
			expect(c.consecutiveFailures).to.be.eql(0);
			await c._req({});
			expect(c.consecutiveFailures).to.be.eql(0);
		});

		it('should not retry for non-retryable errors', async () => {
			const doAxiosRequest = sinon.stub().rejects();
			sinon.stub(errors, 'isErrorRetryable').returns(false);
			const c = new WSConnectionFallback({ client: newClient({ doAxiosRequest }) });
			sinon.spy(c);

			expect(c.consecutiveFailures).to.be.eql(0);
			await expect(c._req({}, {}, true)).to.be.rejected;
			expect(c.consecutiveFailures).to.be.eql(1);
			expect(c._req.calledOnce).to.be.true;
		});

		it('should not retry when retry flag is false', async () => {
			const doAxiosRequest = sinon.stub().rejects();
			sinon.stub(errors, 'isErrorRetryable').returns(true);
			const c = new WSConnectionFallback({ client: newClient({ doAxiosRequest }) });
			sinon.spy(c);

			expect(c.consecutiveFailures).to.be.eql(0);
			await expect(c._req({}, {}, false)).to.be.rejected;
			expect(c.consecutiveFailures).to.be.eql(1);
			expect(c._req.calledOnce).to.be.true;
		});

		it('should retry errors if it is retryable', async () => {
			const doAxiosRequest = sinon.stub().rejects();
			sinon.stub(errors, 'isErrorRetryable').onCall(0).returns(true).onCall(1).returns(true).returns(false);
			sinon.stub(utils, 'sleep').resolves();
			const c = new WSConnectionFallback({ client: newClient({ doAxiosRequest }) });
			sinon.spy(c, '_req');

			expect(c.consecutiveFailures).to.be.eql(0);
			await expect(c._req({}, {}, true)).to.be.rejected;
			expect(c.consecutiveFailures).to.be.eql(3);
			expect(c._req.calledThrice).to.be.true;
		});
	});

	describe('connect', () => {
		const health = { connection_id: 'connectionID' };
		it('should skip connect if already connecting or connected', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			sinon.spy(c);
			c.state = ConnectionState.Connecting;
			expect(await c.connect()).to.be.undefined;
			c.state = ConnectionState.Connected;
			expect(await c.connect()).to.be.undefined;
			expect(c._setState.called).to.be.false;
			expect(c._req.called).to.be.false;
		});

		it('should send request in correct format', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().resolves({ event: health });
			c._poll = sinon.spy();

			expect(await c.connect()).to.be.eql(health);
			expect(c.client._buildWSPayload.calledOnce).to.be.true;
			expect(c._poll.calledOnce).to.be.true;
			expect(c._req.calledOnceWithExactly({ json: 'payload' }, { timeout: 8000 }, false)).to.be.true;

			c.state = ConnectionState.Init;
			c._req = sinon.stub().resolves({ event: health });
			expect(await c.connect(true)).to.be.eql(health);
			expect(c._req.calledOnceWithExactly({ json: 'payload' }, { timeout: 8000 }, true)).to.be.true;
		});

		it('should update state and connectionID', async () => {
			let c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().resolves({ event: health });
			c._poll = sinon.spy();
			expect(await c.connect()).to.be.eql(health);
			expect(c.state).to.be.eql(ConnectionState.Connected);
			expect(c.connectionID).to.be.eql(health.connection_id);

			c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().rejects();
			c._poll = sinon.spy();
			await expect(c.connect()).to.be.rejected;
			expect(c._poll.called).to.be.false;
			expect(c.state).to.be.eql(ConnectionState.Closed);
			expect(c.connectionID).to.be.undefined;
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
			await expect(c.connect()).to.be.rejected;
			expect(c._poll.called).to.be.false;
		});

		it('should recoverState correctly', async () => {
			let c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().resolves({ event: health });
			c._poll = sinon.spy();
			await c.connect();
			expect(c.client.recoverState.called).to.be.false;

			c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().rejects();
			c._poll = sinon.spy();
			await expect(c.connect()).to.be.rejected;
			expect(c.client.recoverState.called).to.be.false;

			c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.stub().resolves({ event: health });
			c._poll = sinon.spy();
			await c.connect(true);
			expect(c.client.recoverState.called).to.be.true;
		});
	});

	describe('_poll', () => {
		it('should do nothing if not in connect state', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c._req = sinon.spy();
			expect(await c._poll()).to.be.undefined;
			expect(c._req.called).to.be.false;

			c.state = ConnectionState.Connecting;
			expect(await c._poll()).to.be.undefined;
			expect(c._req.called).to.be.false;
		});

		it('should send request in correct format', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c.state = ConnectionState.Connected;
			c._req = async () => {
				c.state = ConnectionState.Closed;
				return {};
			};
			sinon.spy(c, '_req');
			await c._poll();
			expect(c._req.calledOnceWithExactly({}, { timeout: 30000 }, true)).to.be.true;
		});

		it('should dispatch incoming events', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c.state = ConnectionState.Connected;

			c._req = async () => {
				c.state = ConnectionState.Closed;
				return { events: ['1', '2'] };
			};
			await c._poll();
			expect(c.client.dispatchEvent.calledTwice).to.be.true;
			expect(c.client.dispatchEvent.getCall(0).args).to.be.eql(['1']);
			expect(c.client.dispatchEvent.getCall(1).args).to.be.eql(['2']);
		});

		it('should reconnect if ConnectionID err', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c.state = ConnectionState.Connected;
			c.connect = sinon.spy();
			c._req = async () => {
				const err = new Error();
				err.code = 46;
				throw err;
			};

			await c._poll();
			expect(c.state).to.be.eql(ConnectionState.Disconnected);
			expect(c.connect.calledOnceWithExactly(true)).to.be.true;
		});

		it('should stop for non-retryable errors', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c.state = ConnectionState.Connected;
			c._req = sinon.stub().rejects();
			sinon.stub(errors, 'isErrorRetryable').returns(false);
			sinon.stub(errors, 'isAPIError').returns(true);

			await c._poll();
			expect(c.state).to.be.eql(ConnectionState.Closed);
		});

		it('should continue retrying for random errors', async () => {
			const c = new WSConnectionFallback({ client: newClient() });
			c.state = ConnectionState.Connected;
			c._req = sinon.stub().rejects();

			let counter = 0;
			sinon.stub(utils, 'sleep').callsFake(() => {
				if (++counter > 2) c.state = ConnectionState.Disconnected;
			});

			await c._poll();
			expect(c._req.calledThrice).to.be.true;
			expect(utils.sleep.calledThrice).to.be.true;
		});
	});
});
