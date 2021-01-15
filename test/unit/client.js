import chai from 'chai';
import { StreamChat } from '../../src/client';

const expect = chai.expect;

describe('Client userMuteStatus', function () {
	const client = new StreamChat('', '');
	const user = { id: 'user' };

	client.connectUser = async () => {
		client.user = user;
		client.wsPromise = Promise.resolve();
	};

	const mutes = [
		{ user, target: { id: 'mute1' } },
		{ user, target: { id: 'mute2' } },
		{ user, target: { id: 'mute3' } },
		{ user, target: { id: 'mute4' } },
	];

	it('default userMutes should be empty', function () {
		expect(client.mutedUsers).to.have.length(0);
	});

	it('should throw error if setUser is not called', function () {
		expect(() => client.userMuteStatus('')).to.throw();
	});

	it('should not throw error if connectUser is called', async function () {
		await client.connectUser();
		expect(() => client.userMuteStatus('')).not.to.throw();
	});

	it('should return correctly when checking mute status', function () {
		client.dispatchEvent({ type: 'health.check', me: { ...user, mutes } });

		expect(client.userMuteStatus('mute1')).to.be.ok;
		expect(client.userMuteStatus('mute2')).to.be.ok;
		expect(client.userMuteStatus('mute3')).to.be.ok;
		expect(client.userMuteStatus('mute4')).to.be.ok;
		expect(client.userMuteStatus('missingUser')).not.to.be.ok;
	});

	it('should return correctly when mutes is updated', function () {
		client.dispatchEvent({
			type: 'notification.mutes_updated',
			me: {
				...user,
				mutes: [
					{ user, target: { id: 'mute1' } },
					{ user, target: { id: 'mute5' } },
				],
			},
		});

		expect(client.userMuteStatus('mute1')).to.be.ok;
		expect(client.userMuteStatus('mute5')).to.be.ok;
		expect(client.userMuteStatus('mute2')).not.to.be.ok;
		expect(client.userMuteStatus('mute3')).not.to.be.ok;
		expect(client.userMuteStatus('mute4')).not.to.be.ok;
		expect(client.userMuteStatus('missingUser')).not.to.be.ok;
	});
});

describe('Detect node environment', () => {
	const client = new StreamChat('', '');
	it('node property should be true', () => {
		expect(client.node).to.be.true;
	});

	it('should warn when using connectUser on a node environment', async () => {
		const _warn = console.warn;
		let warning = '';
		console.warn = (msg) => {
			warning = msg;
		};

		try {
			await client.connectUser({ id: 'user' }, 'fake token');
		} catch (e) {}

		await client.disconnect();
		expect(warning).to.equal(
			'Please do not use connectUser server side. connectUser impacts MAU and concurrent connection usage and thus your bill. If you have a valid use-case, add "allowServerSideConnect: true" to the client options to disable this warning.',
		);

		console.warn = _warn;
	});

	it('should not warn when adding the allowServerSideConnect flag', async () => {
		const client2 = new StreamChat('', '', { allowServerSideConnect: true });

		const _warn = console.warn;
		let warning = '';
		console.warn = (msg) => {
			warning = msg;
		};

		try {
			await client2.connectUser({ id: 'user' }, 'fake token');
		} catch (e) {}

		await client2.disconnect();
		expect(warning).to.equal('');

		console.warn = _warn;
	});
});
