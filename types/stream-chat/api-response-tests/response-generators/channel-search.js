const { v4: uuidv4 } = require('uuid');
const utils = require('../utils');

const johnID = `john-${uuidv4()}`;

async function channelSearch() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuidv4()}`, {
		members: [johnID],
	});
	await channel.create();
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
