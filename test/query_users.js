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

	it('query users by name', async function() {
		const userID = uuidv4();
		const client = await getTestClientForUser(userID, 'just cruising', {
			name: 'Curiosity Rover',
		});
		const response = await client.queryUsers({ name: { $q: 'rove' } });
		expect(response.users.length).to.equal(1);
		expect(response.users[0].id).to.equal(userID);
	});

	it('query users by username', async function() {
		const userID = uuidv4();
		const client = await getTestClientForUser(userID, 'just cruising', {
			username: 'rover_curiosity',
		});
		const response = await client.queryUsers({ username: { $q: 'rove' } });
		expect(response.users.length).to.equal(1);
		expect(response.users[0].id).to.equal(userID);
	});

	it.only('query users unsupported field', async function() {
		const userID = uuidv4();
		const client = await getTestClientForUser(userID, 'just cruising', {
			mycustomfield: 'Curiosity Rover',
		});
		const queryPromise = client.queryUsers({ mycustomfield: { $q: 'rove' } });
		expect(queryPromise).to.be.rejectedWith(
			'Fulltext search is not enabled for user field "mycustomfield"',
		);
	});
});
