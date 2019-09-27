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

module.exports = {
	updateUsers,
};
