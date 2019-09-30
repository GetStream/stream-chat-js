const uuid4 = require('uuid/v4');
const fs = require('fs');
const utils = require('../utils');

const johnID = `john-${uuid4()}`;

async function channelSearch() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', 'poppins');
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
