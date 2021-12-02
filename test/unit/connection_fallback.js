import chai from 'chai';
import sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';

import * as utils from '../../src/utils';
import { ConnectionState, WSConnectionFallback } from '../../src/connection_fallback';

chai.use(chaiAsPromised);
const expect = chai.expect;

describe('connection_fallback', () => {
	const newClient = () => ({
		baseURL: 'url.com',
		logger: () => null,
		doAxiosRequest: () => null,
		_buildWSPayload: () => sinon.stub().returns('payload'),
		dispatchEvent: sinon.spy(),
		handleEvent: sinon.spy(),
		recoverState: sinon.spy(),
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
});
