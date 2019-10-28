const uuidv4 = require('uuid/v4');
const utils = require('../utils');

const johnID = `john-${uuidv4()}`;

async function setUser() {
	const user1 = uuidv4();
	const user2 = uuidv4();
	await utils.createUsers([user1, user2]);
	const client1 = await utils.getTestClientForUser(user1);

	await client1.muteUser(user2);

	const authClient = await utils.getTestClient(false);
	return authClient.setUser({ id: user1 }, utils.createUserToken(user1));
}

module.exports = {
	setUser,
};
