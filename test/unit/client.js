import chai from 'chai';
import { StreamChat } from '../../src/client';

const expect = chai.expect;

describe('Client userMuteStatus', function () {
	const client = new StreamChat('', '');
	const user = { id: 'user' };

	client.setUser = async () => {
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

	it('should not throw error if setUser is called', async function () {
		await client.setUser();
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
