const { v4: uuid4 } = require('uuid');
const utils = require('../utils');

const johnID = `john-${uuid4()}`;

async function channelSearch() {
	const authClient = await utils.getTestClientForUser(johnID);
	const channel = await utils.createTestChannelForUser(`poppins-${uuid4()}`, johnID);
	const keyword = 'supercalifragilisticexpialidocious';
	await channel.sendMessage({ text: `words ${keyword} what?` });
	await channel.sendMessage({ text: `great movie because of ${keyword}` });

	const filters = { type: 'messaging' };
	return await authClient.search(filters, 'supercalifragilisticexpialidocious', {
		limit: 2,
		offset: 0,
	});
}

module.exports = {
	channelSearch,
};
