import chai from 'chai';

import { getServerTestClient, sleep } from './utils';

import { v4 as uuidv4 } from 'uuid';

const expect = chai.expect;

describe('Channel export', function () {
	const serverClient = getServerTestClient();
	const created_by = { id: uuidv4(), name: 'Eric' };

	let testChannel = serverClient.channel('livestream', uuidv4(), { created_by });
	let taskId = uuidv4();

	it('check status for a task that does not exist', async () => {
		const p = serverClient.getExportChannelStatus(taskId);
		await expect(p).to.be.rejectedWith(`"Can't find task with id "${taskId}"`);
	});

	it('request the export for a channel that does not exist', async () => {
		const p = serverClient.exportChannel({
			type: testChannel.type,
			id: testChannel.id,
		});
		await expect(p).to.be.rejected;
	});

	it('create a test channel for later export', async () => {
		await testChannel.create();
		await testChannel.sendMessage({ text: 'Hey Joni', user: created_by });
	});

	it('request the channel export', async () => {
		const response = await serverClient.exportChannel({
			type: testChannel.type,
			id: testChannel.id,
		});
		expect(response.task_id).to.not.be.undefined;
		expect(response.task_id).to.not.eql('');
		taskId = response.task_id;
	});

	it('check the status for the task by its ID', async () => {
		const response = await serverClient.getExportChannelStatus(taskId);
		expect(response.status).to.not.be.undefined;
		expect(response.created_at).to.not.be.undefined;
		expect(response.updated_at).to.not.be.undefined;
		expect(response.result).to.not.be.undefined;
		expect(response.error).to.not.be.undefined;
	});

	it('wait until the task is ready', async () => {
		let response;
		while (true) {
			response = await serverClient.getExportChannelStatus(taskId);
			if (response.status === 'completed') {
				break;
			}
			console.log('task not completed yet wait and retry later');
			await sleep(300);
		}
		expect(response.result).to.not.be.undefined;
		expect(response.result.url).to.be.not.eq('');
	});
});
