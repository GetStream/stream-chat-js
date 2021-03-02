import {
	createUsers,
	createUserToken,
	expectHTTPErrorCode,
	getTestClient,
} from './utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { v4 as uuidv4 } from 'uuid';

chai.use(chaiAsPromised);

function randomIP() {
	return (
		Math.floor(Math.random() * 255) +
		1 +
		'.' +
		Math.floor(Math.random() * 255) +
		'.' +
		Math.floor(Math.random() * 255) +
		'.' +
		Math.floor(Math.random() * 255)
	);
}

// mockIP appends X-Forwarded-For to the user agent string
function mockIP(client, ip) {
	client.setUserAgent(
		client.getUserAgent() + `&X-Forwarded-For=${ip}&X-Forwarded-Port=80`,
	);
}

describe('ban user by ip', () => {
	const serverClient = getTestClient(true);
	const adminUser = {
		id: uuidv4(),
	};

	const ip1 = randomIP();
	const ip2 = randomIP();
	const ip3 = randomIP();

	const tommasoID = `tommaso-${uuidv4()}`;
	const thierryID = `thierry-${uuidv4()}`;
	const tommasoChannelId = `test-channels-${uuidv4()}`;
	const thierryChannelId = `test-channels-${uuidv4()}`;
	const tommasoToken = createUserToken(tommasoID);
	const thierryToken = createUserToken(thierryID);
	const tommasoClient1 = getTestClient();
	mockIP(tommasoClient1, ip1);
	const tommasoClient2 = getTestClient();
	mockIP(tommasoClient2, ip2);
	const thierryClient1 = getTestClient();
	mockIP(thierryClient1, ip1);
	const thierryClient2 = getTestClient();
	mockIP(thierryClient2, ip3);

	before(async () => {
		await createUsers([adminUser.id]);
		await tommasoClient1.connectUser({ id: tommasoID }, tommasoToken);
		await thierryClient1.connectUser({ id: thierryID }, thierryToken);
	});

	it('tommaso and thierry create channels', async () => {
		await tommasoClient1.channel('messaging', tommasoChannelId).watch();
		await thierryClient1.channel('messaging', thierryChannelId).watch();
	});

	it('tommasso1 is not banned yet', async () => {
		await tommasoClient1
			.channel('messaging', tommasoChannelId)
			.sendMessage({ text: 'I am not banned yet' });
	});

	it('ban tommaso by IP', async () => {
		await serverClient.banUser(tommasoID, {
			banned_by_id: adminUser.id,
			ip_ban: true,
		});
	});

	it('tommasso1 is banned', async () => {
		await expectHTTPErrorCode(
			403,
			tommasoClient1
				.channel('messaging', tommasoChannelId)
				.sendMessage({ text: 'I am banned' }),
		);
	});

	it('thierry1 is banned because he has same ip', async () => {
		await expectHTTPErrorCode(
			403,
			thierryClient1
				.channel('messaging', thierryChannelId)
				.sendMessage({ text: 'I am banned' }),
		);
	});

	it('tommaso and thierry switch IP addresses', async () => {
		await tommasoClient2.connectUser({ id: tommasoID }, tommasoToken);
		await thierryClient2.connectUser({ id: thierryID }, thierryToken);
		await tommasoClient2.channel('messaging', tommasoChannelId).watch();
		await thierryClient2.channel('messaging', thierryChannelId).watch();
	});

	it('tommasso2 is banned', async () => {
		await expectHTTPErrorCode(
			403,
			tommasoClient2
				.channel('messaging', tommasoChannelId)
				.sendMessage({ text: 'I am banned' }),
		);
	});

	it('thierry2 is not banned', async () => {
		await thierryClient2
			.channel('messaging', thierryChannelId)
			.sendMessage({ text: 'I am not banned' });
	});

	it('unban tommaso', async () => {
		await serverClient.unbanUser(tommasoID);
	});

	it('no one is banned', async () => {
		await tommasoClient1
			.channel('messaging', tommasoChannelId)
			.sendMessage({ text: 'I am not banned' });
		await tommasoClient2
			.channel('messaging', tommasoChannelId)
			.sendMessage({ text: 'I am not banned' });
		await thierryClient1
			.channel('messaging', thierryChannelId)
			.sendMessage({ text: 'I am not banned' });
		await thierryClient2
			.channel('messaging', thierryChannelId)
			.sendMessage({ text: 'I am not banned' });
	});
});
