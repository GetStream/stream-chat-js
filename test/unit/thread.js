import chai from 'chai';
import { v4 as uuidv4 } from 'uuid';

import { generateChannel } from './test-utils/generateChannel';
import { generateMember } from './test-utils/generateMember';
import { generateMsg } from './test-utils/generateMessage';
import { generateUser } from './test-utils/generateUser';
import { getClientWithUser } from './test-utils/getClient';
import { getOrCreateChannelApi } from './test-utils/getOrCreateChannelApi';
import sinon from 'sinon';
import { mockChannelQueryResponse } from './test-utils/mockChannelQueryResponse';

import { ChannelState, StreamChat, Thread } from '../../src';
import { generateThread } from './test-utils/generateThread';

const expect = chai.expect;

describe('Thread', () => {
	describe('addReply', async () => {
		let client;
		let channel;
		let parent;
		let thread;

		beforeEach(() => {
			client = new StreamChat('apiKey');
			client.userID = 'observer';
			channel = generateChannel().channel;
			parent = generateMsg();
			thread = new Thread({ client, threadData: generateThread(channel, parent) });
		});
		it('should throw error if the message is not a reply to the parent', async () => {
			const reply = generateMsg({
				status: 'pending',
				parent_id: 'some_other_id',
			});
			expect(() => thread.addReply(reply)).to.throw('Message does not belong to this thread');
		});

		it('should add reply to the thread', async () => {
			const reply1 = generateMsg({
				status: 'pending',
				parent_id: parent.id,
			});

			thread.addReply(reply1);
			expect(thread.latestReplies).to.have.length(1);
			expect(thread.latestReplies[0].status).to.equal('pending');

			reply1.status = 'received';
			thread.addReply(reply1);
			expect(thread.latestReplies).to.have.length(1);
			expect(thread.latestReplies[0].status).to.equal('received');

			const reply2 = generateMsg({
				status: 'pending',
				parent_id: parent.id,
			});

			thread.addReply(reply2);
			expect(thread.latestReplies).to.have.length(2);
			expect(thread.latestReplies[1].status).to.equal('pending');

			reply2.status = 'received';
			thread.addReply(reply2);
			expect(thread.latestReplies).to.have.length(2);
			expect(thread.latestReplies[1].status).to.equal('received');
		});
	});
});
