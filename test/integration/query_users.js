/* eslint no-unused-vars: "off" */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Immutable from 'seamless-immutable';
import { StreamChat } from '../../src';
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
	expectHTTPErrorCode,
} from './utils';
import { v4 as uuidv4 } from 'uuid';

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

describe('Query Users', function () {
	it('query users by id', async function () {
		const userID = uuidv4();
		const client = await getTestClientForUser(userID);
		const response = await client.queryUsers({ id: { $in: [userID] } });
		expect(response.users.length).to.equal(1);
		expect(response.users[0].id).to.equal(userID);
	});

	describe('query users by teams', async () => {
		const userID = uuidv4();
		let client;

		before(async () => {
			client = await getTestClientForUser(userID);
		});

		it('with null for missing ones', async () => {
			const response = await client.queryUsers({ teams: null, id: userID });
			expect(response.users.length).to.equal(1);
			expect(response.users[0].id).to.equal(userID);
		});

		it('not null expects error', async () => {
			await expectHTTPErrorCode(400, client.queryUsers({ teams: '', id: userID }));
		});
	});

	it('autocomplete users by name or username', async function () {
		const userID = uuidv4();
		const userID2 = uuidv4();
		const userID3 = uuidv4();
		const unique = uuidv4();
		const serverClient = getServerTestClient();
		await serverClient.updateUsers([
			{
				id: userID,
				unique,
				name: 'Curiosity Rover',
				username: 'curiosity_rover',
			},
			{
				id: userID2,
				unique,
				name: 'Roxy',
			},
			{
				id: userID3,
				unique,
				name: 'Roxanne',
			},
		]);
		const response = await serverClient.queryUsers(
			{
				unique,
				$or: [
					{ name: { $autocomplete: 'ro' } },
					{ username: { $autocomplete: 'ro' } },
				],
			},
			{ name: 1 },
		);

		expect(response.users[0].name).to.equal('Roxy');
		expect(response.users[1].name).to.equal('Roxanne');
		expect(response.users[2].name).to.equal('Curiosity Rover');
	});

	it('autocomplete users by username', async function () {
		const userID = uuidv4();
		const unique = uuidv4();
		const client = await getTestClientForUser(userID, 'just cruising', {
			unique,
			username: 'rover_curiosity',
		});
		const response = await client.queryUsers({
			unique,
			username: { $autocomplete: 'rove' },
		});
		expect(response.users[0].username).to.equal('rover_curiosity');
	});

	it('autocomplete users by id', async function () {
		const userID = uuidv4();
		const unique = uuidv4();
		const client = await getTestClientForUser(userID, 'just cruising', {
			unique,
			username: 'rover_curiosity',
		});
		const response = await client.queryUsers({
			unique,
			id: { $autocomplete: userID.slice(0, 8) },
		});
		expect(response.users[0].id).to.equal(userID);
		expect(response.users[0].username).to.equal('rover_curiosity');
	});

	it('query users unsupported field', async function () {
		const userID = uuidv4();
		const unique = uuidv4();
		const client = await getTestClientForUser(userID, 'just cruising', {
			unique,
			mycustomfield: 'Curiosity Rover',
		});
		const queryPromise = client.queryUsers({ unique, mycustomfield: { $q: 'rove' } });
		await expect(queryPromise).to.be.rejectedWith(
			'StreamChat error code 4: QueryUsers failed with error: "search is not enabled for field users.mycustomfield',
		);
	});

	it('return mutes for server side client', async function () {
		const client = getServerTestClient();
		const userID = uuidv4();
		const userID2 = uuidv4();
		const userID3 = uuidv4();
		const unique = uuidv4();

		await client.updateUsers([
			{
				id: userID,
				unique,
				name: 'Curiosity Rover',
			},
			{
				id: userID2,
				unique,
				name: 'Roxy',
			},
			{
				id: userID3,
				unique,
				name: 'Roxanne',
			},
		]);

		await client.muteUser(userID2, userID);
		await client.muteUser(userID3, userID);

		const response = await client.queryUsers({
			id: { $eq: userID },
		});

		expect(response.users.length).eq(1);
		expect(response.users[0].mutes.length).eq(2);

		const mute1 = response.users[0].mutes[0];
		const mute2 = response.users[0].mutes[1];

		expect(mute1.user.id).eq(userID);
		expect(mute2.user.id).eq(userID);
		expect([mute1.target.id, mute2.target.id]).to.have.members([userID2, userID3]);
	});

	it('return mutes with expiration for server side client', async function () {
		const client = getServerTestClient();
		const userID = uuidv4();
		const userID2 = uuidv4();
		const userID3 = uuidv4();
		const unique = uuidv4();

		await client.updateUsers([
			{
				id: userID,
				unique,
				name: 'Curiosity Rover',
			},
			{
				id: userID2,
				unique,
				name: 'Roxy',
			},
			{
				id: userID3,
				unique,
				name: 'Roxanne',
			},
		]);

		await client.muteUser(userID2, userID, { timeout: 10 });
		await client.muteUser(userID3, userID, { timeout: 10 });

		const response = await client.queryUsers({
			id: { $eq: userID },
		});

		expect(response.users.length).eq(1);
		expect(response.users[0].mutes.length).eq(2);

		const mute1 = response.users[0].mutes[0];
		const mute2 = response.users[0].mutes[1];

		expect(mute1.user.id).eq(userID);
		expect(mute1.expires).to.not.be.undefined;
		expect(mute2.user.id).eq(userID);
		expect(mute2.expires).to.not.be.undefined;
		expect([mute1.target.id, mute2.target.id]).to.have.members([userID2, userID3]);
	});
});
