const uuid4 = require('uuid/v4');
const utils = require('../utils');

async function updateUsers() {
	const client = utils.getServerTestClient();
	const userID = uuid4();
	const userID2 = uuid4();
	const userID3 = uuid4();
	const unique = uuid4();

	return await client.updateUsers([
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
}

async function partialUpdateUser() {
	const client = utils.getServerTestClient();
	const userID = uuid4();
	const unique = uuid4();

	await client.updateUsers([
		{
			id: userID,
			unique,
			name: 'Curiosity Rover',
			company: 'Stream',
			gender: 'Male',
		},
	]);

	return await client.partialUpdateUser({
		id: userID,
		set: {
			gender: 'Female',
		},
		unset: ['company'],
	});
}

async function partialUpdateUsers() {
	const client = utils.getServerTestClient();
	const userID = uuid4();
	const userID2 = uuid4();
	const userID3 = uuid4();
	const unique = uuid4();

	await client.updateUsers([
		{
			id: userID,
			unique,
			name: 'Curiosity Rover',
			company: 'Stream',
			gender: 'Male',
		},
		{
			id: userID2,
			unique,
			name: 'Roxy',
			company: 'Stream',
			gender: 'Male',
		},
		{
			id: userID3,
			unique,
			name: 'Roxanne',
			company: 'Stream',
			gender: 'Female',
		},
	]);

	return await client.partialUpdateUsers([
		{
			id: userID,
			set: {
				gender: 'Female',
			},
			unset: ['company'],
		},
		{
			id: userID2,
			set: {
				gender: 'Female',
			},
			unset: ['company'],
		},
		{
			id: userID3,
			set: {
				gender: 'Male',
				work: 'Stream',
			},
			unset: ['company'],
		},
	]);
}

module.exports = {
	updateUsers,
	partialUpdateUser,
	partialUpdateUsers,
};
