/* eslint no-unused-vars: "off" */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Immutable from 'seamless-immutable';
import { StreamChat } from '../src';
import fs from 'fs';
import {
	createUserToken,
	getTestClient,
	getTestClientForUser,
	getTestClientForUser2,
	getServerTestClient,
	createUsers,
	runAndLogPromise,
	sleep,
} from './utils';
import uuidv4 from 'uuid/v4';

const expect = chai.expect;

chai.use(chaiAsPromised);

if (process.env.NODE_ENV !== 'production') {
	require('longjohn');
}

Promise = require('bluebird'); // eslint-disable-line no-global-assign
Promise.config({
	longStackTraces: true,
	warnings: {
		wForgottenReturn: false,
	},
});

describe('Query Users', function() {
	it('query users by id', async function() {
		const userID = uuidv4();
		const client = await getTestClientForUser(userID);
		const response = await client.queryUsers({ id: { $in: [userID] } });
		expect(response.users.length).to.equal(1);
		expect(response.users[0].id).to.equal(userID);
	});

	it('autocomplete users by name', async function() {
		const userID = uuidv4();
		const userID2 = uuidv4();
		const serverClient = getServerTestClient();
		const client = await serverClient.updateUsers([
			{
				id: userID,
				name: 'Curiosity Rover',
			},
			{
				id: userID2,
				name: 'Roxanne',
			},
		]);
		const response = await serverClient.queryUsers({
			id: { $in: [userID, userID2] },
			name: { $autocomplete: 'ro' },
		});
		expect(response.users[0].name).to.equal('Roxanne');
		expect(response.users[1].name).to.equal('Curiosity Rover');
	});

	it('autocomplete users by username', async function() {
		const userID = uuidv4();
		const client = await getTestClientForUser(userID, 'just cruising', {
			username: 'rover_curiosity',
		});
		const response = await client.queryUsers({ username: { $autocomplete: 'rove' } });
		expect(response.users[0].username).to.equal('rover_curiosity');
	});

	it('query users unsupported field', async function() {
		const userID = uuidv4();
		const client = await getTestClientForUser(userID, 'just cruising', {
			mycustomfield: 'Curiosity Rover',
		});
		const queryPromise = client.queryUsers({ mycustomfield: { $q: 'rove' } });
		await expect(queryPromise).to.be.rejectedWith(
			'search is not enabled for field users.mycustomfield',
		);
	});
});
