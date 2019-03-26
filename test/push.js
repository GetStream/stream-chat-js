import chai from 'chai';
import http2 from 'http2';
import { getTestClient, getTestClientForUser, sleep } from './utils';
import uuidv4 from 'uuid/v4';
import fs from 'fs';
import url from 'url';

const expect = chai.expect;

describe('Push notifications', function() {
	let server;
	let lastMessage;
	let messages;
	const tommasoID = `tommaso-${uuidv4()}`;
	const thierryID = `thierry-${uuidv4()}`;
	const channelID = `push-${uuidv4()}`;
	const client = getTestClient(true);
	const thierryDeviceID = uuidv4();
	let chan;

	before(function() {
		chan = client.channel('messaging', channelID, {
			created_by: { id: tommasoID },
			members: [thierryID, tommasoID],
		});

		const cert = fs.readFileSync('./test/push_test/dummy.crt');
		const key = fs.readFileSync('./test/push_test/dummy.key');

		server = http2.createSecureServer({ cert, key, allowHTTP1: true }, (req, res) => {
			let body = '';
			req.on('data', chunk => {
				body += chunk.toString(); // convert Buffer to string
			});

			req.on('end', () => {
				lastMessage = JSON.parse(body);
				lastMessage.device_id = url
					.parse(req.url)
					.pathname.split('/')
					.slice(-1)[0];
				messages.push(lastMessage);
				res.end('{}');
			});

			res.writeHead(200, { 'Content-Type': 'applications/json' });
		});

		server.listen(43210);
		return client
			.updateUser({ id: thierryID })
			.then(function() {
				return client.updateUser({ id: tommasoID });
			})
			.then(function() {
				return client.updateAppSettings({
					apn_config: {
						p12_cert: '',
						pem_cert: '',
						auth_key: fs.readFileSync(
							'./test/push_test/push-test-auth-key.p8',
							'utf-8',
						),
						key_id: 'keykey',
						topic: 'com.apple.test',
						team_id: 'sfd',
						host: 'https://localhost:43210',
						notification_template: `
                        {
                            "aps" : {
                                "alert" : {
                                    "title" : "{{ sender.id }}",
                                    "body" : "{{ message.text }}"
                                },
                                "badge": "{{ unread_count }}",
                                "category" : "NEW_MESSAGE"
                            }
                        }`,
					},
				});
			})
			.then(function() {
				return client.addDevice({
					id: thierryDeviceID,
					provider: 'apn',
					user: {
						id: thierryID,
					},
				});
			})
			.then(function() {
				return chan.create();
			});
	});

	beforeEach(function() {
		lastMessage = null;
		messages = [];
	});

	after(() => {
		server.close();
	});

	it('should receive new message event', async function() {
		const text = `Hi man ${uuidv4()}`;
		await chan.sendMessage({ text, user: { id: tommasoID } });
		await sleep(200);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.aps.alert.title).to.eq(tommasoID);
		expect(lastMessage.aps.alert.body).to.eq(text);
		expect(lastMessage.device_id).to.eq(thierryDeviceID);
	});

	it('adding a device to an offline user should make him receive notifications too', async function() {
		const text = `Hi man ${uuidv4()}`;
		const deviceID = uuidv4();
		await client.addDevice({
			id: deviceID,
			provider: 'apn',
			user: {
				id: tommasoID,
			},
		});
		await chan.sendMessage({ text, user: { id: tommasoID } });
		await sleep(200);

		const hitList = {
			[thierryDeviceID]: true,
			[deviceID]: true,
		};

		expect(messages).to.have.lengthOf(2);
		for (const message of messages) {
			expect(message.aps.alert.title).to.eq(tommasoID);
			expect(message.aps.alert.body).to.eq(text);
			expect(hitList).to.have.property(message.device_id);
			delete hitList[message.device_id];
		}
	});

	it('online users dont get push notifications', async function() {
		const text = `Hi man ${uuidv4()}`;
		await getTestClientForUser(tommasoID); //tommaso is now online

		await chan.sendMessage({ text, user: { id: tommasoID } });
		await sleep(200);
		expect(messages).to.have.lengthOf(1);
		expect(lastMessage).to.not.be.null;
		expect(lastMessage.aps.alert.title).to.eq(tommasoID);
		expect(lastMessage.aps.alert.body).to.eq(text);
		expect(lastMessage.device_id).to.eq(thierryDeviceID);
	});
});
