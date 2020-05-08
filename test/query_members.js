import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { getServerTestClient, createUsers } from './utils';
import uuidv4 from 'uuid/v4';

const expect = chai.expect;

chai.use(chaiAsPromised);

if (process.env.NODE_ENV !== 'production') {
	require('longjohn');
}

const Promise = require('bluebird');
Promise.config({
	longStackTraces: true,
	warnings: {
		wForgottenReturn: false,
	},
});

describe.only('Query Members', function() {
	let tom = 'tom-' + uuidv4();
	let rob = 'rob-' + uuidv4();
	let adam = 'adam-' + uuidv4();
	let invited = 'invited-' + uuidv4();
	let channel;
	let ssClient;
	before(async function() {
		ssClient = await getServerTestClient();
		await ssClient.updateUser({ id: rob, name: 'Robert' });
		await ssClient.updateUser({ id: tom, name: 'Tomas' });
		await ssClient.updateUser({ id: adam, name: 'Adame' });
		await ssClient.updateUser({ id: invited, name: 'Mary' });
		await createUsers([tom, rob, adam]);
		channel = ssClient.channel('messaging', uuidv4(), {
			members: [tom, rob, adam],
			created_by_id: tom,
		});
		await channel.create();
		await channel.inviteMembers([invited]);
	});

	it('query member with name Robert', async function() {
		let results = await channel.queryMembers({ name: 'Robert' });
		expect(results.members.length).to.be.equal(1);
		expect(results.members[0].user.id).to.be.equal(rob);
	});

	it('query members by id', async function() {
		let results = await channel.queryMembers({ id: tom });
		expect(results.members.length).to.be.equal(1);
		expect(results.members[0].user.id).to.be.equal(tom);
	});

	it('query multiple users by id', async function() {
		let results = await channel.queryMembers({ id: { $in: [tom, rob, adam] } });
		expect(results.members.length).to.be.equal(3);
		expect(results.members[0].user.id).to.be.equal(tom);
		expect(results.members[1].user.id).to.be.equal(rob);
		expect(results.members[2].user.id).to.be.equal(adam);
	});
});
