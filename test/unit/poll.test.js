import sinon from 'sinon';
import { Poll, StreamChat } from '../../src';

import { describe, it, afterEach, expect, vi } from 'vitest';

const pollId = 'WD4SBRJvLoGwB4oAoCQGM';

const user1 = {
	id: 'admin',
	role: 'admin',
	created_at: '2022-03-08T09:46:56.840739Z',
	updated_at: '2024-09-13T13:53:32.883409Z',
	last_active: '2024-10-23T08:14:23.299448386Z',
	banned: false,
	online: true,
	mutes: null,
	name: 'Test User',
};

const user1Votes = [
	{
		poll_id: pollId,
		id: '332da4fe-e38c-465c-8f74-e8df69680f13',
		option_id: '85610252-7d50-429c-8183-51a7eba46246',
		user_id: user1.id,
		user: user1,
		created_at: '2024-10-22T15:58:27.756166Z',
		updated_at: '2024-10-22T15:58:27.756166Z',
	},
	{
		poll_id: pollId,
		id: '5657da00-256e-41fc-a580-b7adabcbfbe1',
		option_id: 'dc22dcd6-4fc8-4c92-92c2-bfd63245724c',
		user_id: user1.id,
		user: user1,
		created_at: '2024-10-22T15:58:25.886491Z',
		updated_at: '2024-10-22T15:58:25.886491Z',
	},
];

const user2 = {
	id: 'SmithAnne',
	role: 'user',
	created_at: '2022-01-27T08:28:28.412254Z',
	updated_at: '2024-09-26T10:12:23.427141Z',
	last_active: '2024-10-23T08:01:43.157632831Z',
	banned: false,
	online: true,
	nickname: 'Ann',
	name: 'SmithAnne',
	image: 'https://getstream.io/random_png/?name=SmithAnne',
};

const user2Votes = [
	{
		poll_id: pollId,
		id: 'f428f353-3057-4353-b0b5-b33dcdeb1992',
		option_id: '7312e983-b042-4596-b5ce-f9e82deb363f',
		user_id: user2.id,
		user: user2,
		created_at: '2024-10-22T16:00:50.2493Z',
		updated_at: '2024-10-22T16:00:50.2493Z',
	},
	{
		poll_id: pollId,
		id: '75ba8774-bf17-4edd-8ced-39e7dc6aa7dd',
		option_id: '85610252-7d50-429c-8183-51a7eba46246',
		user_id: user2.id,
		user: user2,
		created_at: '2024-10-22T16:00:54.410474Z',
		updated_at: '2024-10-22T16:00:54.410474Z',
	},
];

const user1Answer = {
	poll_id: pollId,
	id: 'dbb4506c-c5a8-4ca6-86ec-0c57498916fe',
	option_id: '',
	is_answer: true,
	answer_text: 'comment1',
	user_id: user1.id,
	user: user1,
	created_at: '2024-10-23T13:12:57.944913Z',
	updated_at: '2024-10-23T13:12:57.944913Z',
};

const user2Answer = {
	poll_id: pollId,
	id: 'dbb4506c-c5a8-4ca6-86ec-0c57498916xy',
	option_id: '',
	is_answer: true,
	answer_text: 'comment2',
	user_id: user2.id,
	user: user2,
	created_at: '2024-10-23T13:12:57.944913Z',
	updated_at: '2024-10-23T13:12:57.944913Z',
};

const pollResponse = {
	id: pollId,
	name: 'XY',
	description: '',
	voting_visibility: 'public',
	enforce_unique_vote: false,
	max_votes_allowed: 2,
	allow_user_suggested_options: false,
	allow_answers: true,
	vote_count: 4,
	options: [
		{
			id: '85610252-7d50-429c-8183-51a7eba46246',
			text: 'A',
		},
		{
			id: '7312e983-b042-4596-b5ce-f9e82deb363f',
			text: 'B',
		},
		{
			id: 'ba933470-c0da-4b6f-a4d2-d2176ac0d4a8',
			text: 'C',
		},
		{
			id: 'dc22dcd6-4fc8-4c92-92c2-bfd63245724c',
			text: 'D',
		},
	],
	vote_counts_by_option: {
		'7312e983-b042-4596-b5ce-f9e82deb363f': 1,
		'85610252-7d50-429c-8183-51a7eba46246': 2,
		'dc22dcd6-4fc8-4c92-92c2-bfd63245724c': 1,
	},
	answers_count: 1,
	latest_votes_by_option: {
		'dc22dcd6-4fc8-4c92-92c2-bfd63245724c': [user1Votes[1]],
		'7312e983-b042-4596-b5ce-f9e82deb363f': [user2Votes[0]],
		'85610252-7d50-429c-8183-51a7eba46246': [user1Votes[0], user2Votes[1]],
	},
	latest_answers: [user1Answer, user2Answer],
	own_votes: [...user1Votes, user1Answer],
	created_by_id: user1.id,
	created_by: user1,
	created_at: '2024-10-22T15:28:20.580523Z',
	updated_at: '2024-10-22T15:28:20.580523Z',
};

// const client = sinon.createStubInstance(StreamChat);
const client = new StreamChat('apiKey');
client.user = user1;
client.userID = user1.id;
describe('Poll', () => {
	afterEach(() => {
		sinon.reset();
	});

	it('should initialize poll correctly', () => {
		const poll = new Poll({ client, poll: pollResponse });
		expect(poll.id).to.equal(pollResponse.id);
		Object.entries(poll.data).forEach(([key, val]) => {
			if (['id', 'own_votes'].includes(key)) {
				expect(poll.data).not.to.have(key);
			} else if (key === 'maxVotedOptionIds') {
				expect(val).to.eql(['85610252-7d50-429c-8183-51a7eba46246']);
			} else if (key === 'ownVotesByOptionId') {
				expect(val).to.eql({
					'85610252-7d50-429c-8183-51a7eba46246': user1Votes[0],
					'dc22dcd6-4fc8-4c92-92c2-bfd63245724c': user1Votes[1],
				});
			} else if (key === 'ownAnswer') {
				expect(val).to.eql(user1Answer);
			} else if (key === 'lastActivityAt') {
			} else {
				expect(val).to.eql(pollResponse[key]);
			}
		});
	});

	it('should update poll state when handlePollUpdated is called', () => {
		const poll = new Poll({ client, poll: pollResponse });
		const description = 'Description update';
		const updateEvent = {
			type: 'poll.updated',
			poll: { ...pollResponse, description },
		};

		poll.handlePollUpdated(updateEvent);

		expect(poll.data.description).to.equal(description);
	});

	it("should not update poll state when handlePollUpdated is called with other poll's event", () => {
		const poll = new Poll({ client, poll: { ...pollResponse, id: 'X' } });
		const description = 'Description update';
		const updateEvent = {
			type: 'poll.updated',
			poll: { ...pollResponse, description },
		};

		poll.handlePollUpdated(updateEvent);

		expect(poll.data.description).to.equal(pollResponse.description);
	});

	it('should not update poll state when handlePollUpdated is called with other event that poll.updated', () => {
		const poll = new Poll({ client, poll: pollResponse });
		const description = 'Description update';
		const updateEvent = {
			type: 'poll.closed',
			poll: { ...pollResponse, description },
		};

		poll.handlePollUpdated(updateEvent);

		expect(poll.data.description).to.equal(pollResponse.description);
	});

	it('should close the poll when handlePollClosed is called', () => {
		const poll = new Poll({ client, poll: pollResponse });
		expect(poll.data.is_closed).to.be.undefined;
		const closeEvent = {
			type: 'poll.closed',
			poll: { ...pollResponse, is_closed: true },
		};

		poll.handlePollClosed(closeEvent);

		expect(poll.data.is_closed).to.be.true;
	});

	it("should not close the poll when handlePollClosed is called with other poll's event", () => {
		const poll = new Poll({ client, poll: pollResponse });
		expect(poll.data.is_closed).to.be.undefined;
		const closeEvent = {
			type: 'poll.closed',
			poll: { ...pollResponse, id: 'X', is_closed: true },
		};

		poll.handlePollClosed(closeEvent);

		expect(poll.data.is_closed).to.be.undefined;
	});

	it('should not close the poll when handlePollClosed is called with other event that poll.closed', () => {
		const poll = new Poll({ client, poll: pollResponse });
		expect(poll.data.is_closed).to.be.undefined;
		const closeEvent = {
			type: 'poll.updated',
			poll: { ...pollResponse, is_closed: true },
		};

		poll.handlePollClosed(closeEvent);

		expect(poll.data.is_closed).to.be.undefined;
	});

	it('should add a vote when handleVoteCasted is called', () => {
		const poll = new Poll({ client, poll: pollResponse });
		const originalState = poll.data;
		const castedVote = {
			poll_id: pollId,
			id: '332da4fe-e38c-465c-8f74-e8df69680123',
			option_id: 'dc22dcd6-4fc8-4c92-92c2-bfd63245724c',
			user_id: user2.id,
			user: user2,
			created_at: '2024-10-23T15:58:27.756166Z',
			updated_at: '2024-10-23T15:58:27.756166Z',
		};

		const vote_count = originalState.vote_count + 1;

		const vote_counts_by_option = {
			...originalState.vote_counts_by_option,
			[castedVote.option_id]:
				originalState.vote_counts_by_option[castedVote.option_id] + 1,
		};

		const latest_votes_by_option = {
			...originalState.latest_votes_by_option,
			[castedVote.option_id]: [
				...originalState.latest_votes_by_option[castedVote.option_id],
				castedVote,
			],
		};

		poll.handleVoteCasted({
			type: 'poll.vote_casted',
			poll: {
				...pollResponse,
				latest_votes_by_option,
				vote_count,
				vote_counts_by_option,
			},
			poll_vote: castedVote,
		});

		expect(poll.data.ownVotesByOptionId).to.eql(originalState.ownVotesByOptionId);
		expect(poll.data.ownAnswer).to.eql(originalState.ownAnswer);
		expect(poll.data.latest_answers).to.eql(originalState.latest_answers);
		expect(poll.data.latest_votes_by_option).to.eql(latest_votes_by_option);
		expect(poll.data.maxVotedOptionIds).to.eql([
			...originalState.maxVotedOptionIds,
			castedVote.option_id,
		]);
	});

	it('should add own vote when handleVoteCasted is called', () => {
		client.userID = user1.id;
		const poll = new Poll({ client, poll: pollResponse });
		const originalState = poll.data;
		const castedVote = {
			poll_id: pollId,
			id: '332da4fe-e38c-465c-8f74-e8df69680123',
			option_id: 'ba933470-c0da-4b6f-a4d2-d2176ac0d4a8',
			user_id: user1.id,
			user: user1,
			created_at: '2024-10-23T15:58:27.756166Z',
			updated_at: '2024-10-23T15:58:27.756166Z',
		};

		const vote_count = originalState.vote_count + 1;

		const vote_counts_by_option = {
			...originalState.vote_counts_by_option,
			[castedVote.option_id]:
				originalState.vote_counts_by_option[castedVote.option_id] + 1,
		};

		const latest_votes_by_option = {
			...originalState.latest_votes_by_option,
			[castedVote.option_id]: [castedVote],
		};

		const ownVotesByOptionId = {
			...originalState.ownVotesByOptionId,
			'ba933470-c0da-4b6f-a4d2-d2176ac0d4a8': castedVote,
		};

		poll.handleVoteCasted({
			type: 'poll.vote_casted',
			poll: {
				...pollResponse,
				latest_votes_by_option,
				vote_count,
				vote_counts_by_option,
			},
			poll_vote: castedVote,
		});

		expect(poll.data.ownVotesByOptionId).to.eql(ownVotesByOptionId);
		expect(poll.data.ownAnswer).to.eql(originalState.ownAnswer);
		expect(poll.data.latest_answers).to.eql(originalState.latest_answers);
		expect(poll.data.latest_votes_by_option).to.eql(latest_votes_by_option);
		expect(poll.data.maxVotedOptionIds).to.eql(originalState.maxVotedOptionIds);
	});

	it('should add an answer when handleVoteCasted is called', () => {
		const poll = new Poll({ client, poll: pollResponse });
		const originalState = poll.data;
		const castedVote = {
			answer_text: 'XXXX',
			poll_id: pollId,
			id: '332da4fe-e38c-465c-8f74-e8df69680123',
			is_answer: true,
			user_id: user2.id,
			user: user2,
			created_at: '2024-10-23T15:58:27.756166Z',
			updated_at: '2024-10-23T15:58:27.756166Z',
		};

		poll.handleVoteCasted({
			type: 'poll.vote_casted',
			poll: { ...pollResponse },
			poll_vote: castedVote,
		});

		expect(poll.data.ownVotesByOptionId).to.eql(originalState.ownVotesByOptionId);
		expect(poll.data.ownAnswer).to.eql(originalState.ownAnswer);
		expect(poll.data.latest_answers).to.eql([
			castedVote,
			...originalState.latest_answers,
		]);
		expect(poll.data.latest_votes_by_option).to.eql(originalState.latest_votes_by_option);
		expect(poll.data.maxVotedOptionIds).to.eql(originalState.maxVotedOptionIds);
	});

	it('should add own answer when handleVoteCasted is called', () => {
		client.userID = user1.id;
		const poll = new Poll({ client, poll: pollResponse });
		const originalState = poll.data;
		const castedVote = {
			answer_text: 'XXXX',
			poll_id: pollId,
			id: '332da4fe-e38c-465c-8f74-e8df69680123',
			is_answer: true,
			user_id: user1.id,
			user: user1,
			created_at: '2024-10-23T15:58:27.756166Z',
			updated_at: '2024-10-23T15:58:27.756166Z',
		};

		poll.handleVoteCasted({
			type: 'poll.vote_casted',
			poll: { ...pollResponse },
			poll_vote: castedVote,
		});

		expect(poll.data.ownVotesByOptionId).to.eql(originalState.ownVotesByOptionId);
		expect(poll.data.ownAnswer).to.eql(castedVote);
		expect(poll.data.latest_answers).to.eql([
			castedVote,
			...originalState.latest_answers,
		]);
		expect(poll.data.latest_votes_by_option).to.eql(originalState.latest_votes_by_option);
		expect(poll.data.maxVotedOptionIds).to.eql(originalState.maxVotedOptionIds);
	});

	it('should change a vote when handleVoteChanged is called', () => {
		const poll = new Poll({ client, poll: pollResponse });
		const originalState = poll.data;
		const changedToOptionId = 'dc22dcd6-4fc8-4c92-92c2-bfd63245724c';
		const castedVote = {
			poll_id: pollId,
			id: '332da4fe-e38c-465c-8f74-e8df69680123',
			option_id: changedToOptionId,
			user_id: user2.id,
			user: user2,
			created_at: '2024-10-23T15:58:27.756166Z',
		};

		const vote_counts_by_option = {
			...originalState.vote_counts_by_option,
			[changedToOptionId]:
				(originalState.vote_counts_by_option[changedToOptionId] ?? 0) + 1,
		};

		const latest_votes_by_option = {
			...originalState.latest_votes_by_option,
			[changedToOptionId]: [
				...originalState.latest_votes_by_option[changedToOptionId],
				castedVote,
			],
		};

		poll.handleVoteChanged({
			type: 'poll.vote_changed',
			poll: { ...pollResponse, latest_votes_by_option, vote_counts_by_option },
			poll_vote: castedVote,
		});

		expect(poll.data.ownVotesByOptionId).to.eql(originalState.ownVotesByOptionId);
		expect(poll.data.ownAnswer).to.eql(originalState.ownAnswer);
		expect(poll.data.latest_answers).to.eql(originalState.latest_answers);
		expect(poll.data.latest_votes_by_option).to.eql(latest_votes_by_option);
		expect(poll.data.maxVotedOptionIds).to.eql([
			...originalState.maxVotedOptionIds,
			changedToOptionId,
		]);
	});

	it('should change own vote when handleVoteChanged is called', () => {
		client.userID = user1.id;
		const poll = new Poll({ client, poll: pollResponse });
		const originalState = poll.data;
		const changedToOptionId = 'dc22dcd6-4fc8-4c92-92c2-bfd63245724c';
		const castedVote = {
			poll_id: pollId,
			id: '332da4fe-e38c-465c-8f74-e8df69680123',
			option_id: changedToOptionId,
			user_id: user1.id,
			user: user1,
			created_at: '2024-10-23T15:58:27.756166Z',
		};

		const vote_counts_by_option = {
			...originalState.vote_counts_by_option,
			[changedToOptionId]:
				(originalState.vote_counts_by_option[changedToOptionId] ?? 0) + 1,
		};

		const latest_votes_by_option = {
			...originalState.latest_votes_by_option,
			[changedToOptionId]: [
				...originalState.latest_votes_by_option[changedToOptionId],
				castedVote,
			],
		};

		poll.handleVoteChanged({
			type: 'poll.vote_changed',
			poll: { ...pollResponse, latest_votes_by_option, vote_counts_by_option },
			poll_vote: castedVote,
		});

		expect(poll.data.ownVotesByOptionId).to.eql({
			...originalState.ownVotesByOptionId,
			[changedToOptionId]: castedVote,
		});
		expect(poll.data.ownAnswer).to.eql(originalState.ownAnswer);
		expect(poll.data.latest_answers).to.eql(originalState.latest_answers);
		expect(poll.data.latest_votes_by_option).to.eql(latest_votes_by_option);
		expect(poll.data.maxVotedOptionIds).to.eql([
			...originalState.maxVotedOptionIds,
			changedToOptionId,
		]);
	});

	it('should change an answer when handleVoteChanged is called', () => {
		client.userID = user2.id;
		const poll = new Poll({ client, poll: pollResponse });
		const originalState = poll.data;
		const changedAnswer = {
			...user1Answer,
			answer_text: 'changed',
		};

		poll.handleVoteChanged({
			type: 'poll.vote_changed',
			poll: { ...pollResponse },
			poll_vote: changedAnswer,
		});

		expect(poll.data.ownVotesByOptionId).to.eql(originalState.ownVotesByOptionId);
		expect(poll.data.ownAnswer).to.eql(originalState.ownAnswer);
		expect(poll.data.latest_answers).to.eql([
			changedAnswer,
			...originalState.latest_answers,
		]);
		expect(poll.data.latest_votes_by_option).to.eql(originalState.latest_votes_by_option);
		expect(poll.data.maxVotedOptionIds).to.eql(originalState.maxVotedOptionIds);
	});

	it('should change own answer when handleVoteChanged is called', () => {
		client.userID = user1.id;
		const poll = new Poll({ client, poll: pollResponse });
		const originalState = poll.data;
		const changedAnswer = {
			...user1Answer,
			answer_text: 'changed',
		};

		poll.handleVoteChanged({
			type: 'poll.vote_changed',
			poll: { ...pollResponse },
			poll_vote: changedAnswer,
		});

		expect(poll.data.ownVotesByOptionId).to.eql(originalState.ownVotesByOptionId);
		expect(poll.data.ownAnswer).to.eql(changedAnswer);
		expect(poll.data.latest_answers).to.eql([
			changedAnswer,
			...originalState.latest_answers.filter((a) => a.id !== changedAnswer.id),
		]);
		expect(poll.data.latest_votes_by_option).to.eql(originalState.latest_votes_by_option);
		expect(poll.data.maxVotedOptionIds).to.eql(originalState.maxVotedOptionIds);
	});

	it('should remove a vote when handleVoteRemoved is called', () => {
		client.userID = user1.id;
		const poll = new Poll({ client, poll: pollResponse });
		const originalState = poll.data;
		const vote_counts_by_option = {
			...originalState.vote_counts_by_option,
			[user2Votes[1].option_id]:
				originalState.vote_counts_by_option[user2Votes[1].option_id] - 1,
		};

		const latest_votes_by_option = {
			...originalState.latest_votes_by_option,
			[user2Votes[1].option_id]: originalState.latest_votes_by_option[
				user2Votes[1].option_id
			].filter((v) => v.option_id !== user2Votes[1].option_id),
		};

		poll.handleVoteRemoved({
			type: 'poll.vote_removed',
			poll: {
				...pollResponse,
				latest_votes_by_option,
				vote_count: originalState.vote_count - 1,
				vote_counts_by_option,
			},
			poll_vote: { ...user2Votes[1], user_id: user2Votes[1].user.id },
		});

		expect(poll.data.ownVotesByOptionId).to.eql(originalState.ownVotesByOptionId);
		expect(poll.data.ownAnswer).to.eql(originalState.ownAnswer);
		expect(poll.data.latest_answers).to.eql(originalState.latest_answers);
		expect(poll.data.latest_votes_by_option).to.eql(latest_votes_by_option);
		expect(poll.data.maxVotedOptionIds).to.eql([
			'7312e983-b042-4596-b5ce-f9e82deb363f',
			'85610252-7d50-429c-8183-51a7eba46246',
			'dc22dcd6-4fc8-4c92-92c2-bfd63245724c',
		]);
	});

	it('should remove own vote when handleVoteRemoved is called', () => {
		client.userID = user1.id;
		const poll = new Poll({ client, poll: pollResponse });
		const originalState = poll.data;
		const removedVote = user1Votes[0];
		const optionId = user1Votes[0].option_id;
		const vote_counts_by_option = {
			...originalState.vote_counts_by_option,
			[optionId]: originalState.vote_counts_by_option[optionId] - 1,
		};

		const latest_votes_by_option = {
			...originalState.latest_votes_by_option,
			[optionId]: originalState.latest_votes_by_option[optionId].filter(
				(v) => v.option_id !== user1Votes[1].option_id,
			),
		};

		poll.handleVoteRemoved({
			type: 'poll.vote_removed',
			poll: {
				...pollResponse,
				latest_votes_by_option,
				vote_count: originalState.vote_count - 1,
				vote_counts_by_option,
			},
			poll_vote: { ...removedVote, user_id: client.userID },
		});

		expect(poll.data.ownVotesByOptionId).to.eql({
			'dc22dcd6-4fc8-4c92-92c2-bfd63245724c': user1Votes[1],
		});
		expect(poll.data.ownAnswer).to.eql(originalState.ownAnswer);
		expect(poll.data.latest_answers).to.eql(originalState.latest_answers);
		expect(poll.data.latest_votes_by_option).to.eql(latest_votes_by_option);
		expect(poll.data.maxVotedOptionIds).to.eql([
			'7312e983-b042-4596-b5ce-f9e82deb363f',
			'85610252-7d50-429c-8183-51a7eba46246',
			'dc22dcd6-4fc8-4c92-92c2-bfd63245724c',
		]);
	});

	it('should remove an answer when handleVoteRemoved is called', () => {
		client.userID = user1.id;
		const poll = new Poll({ client, poll: pollResponse });
		const originalState = poll.data;
		const removedAnswer = user2Answer;

		poll.handleVoteRemoved({
			type: 'poll.vote_removed',
			poll: { ...pollResponse },
			poll_vote: { ...removedAnswer, user_id: user2Answer.user_id },
		});

		expect(poll.data.ownVotesByOptionId).to.eql(originalState.ownVotesByOptionId);
		expect(poll.data.ownAnswer).to.eql(originalState.ownAnswer);
		expect(poll.data.latest_answers).to.eql(
			originalState.latest_answers.filter((a) => a.id !== removedAnswer.id),
		);
		expect(poll.data.latest_votes_by_option).to.eql(originalState.latest_votes_by_option);
		expect(poll.data.maxVotedOptionIds).to.eql(originalState.maxVotedOptionIds);
	});

	it('should remove own answer when handleVoteRemoved is called', () => {
		client.userID = user1.id;
		const poll = new Poll({ client, poll: pollResponse });
		const originalState = poll.data;
		const removedAnswer = user1Answer;

		poll.handleVoteRemoved({
			type: 'poll.vote_removed',
			poll: { ...pollResponse },
			poll_vote: { ...removedAnswer, user_id: client.userID },
		});

		expect(poll.data.ownVotesByOptionId).to.eql(originalState.ownVotesByOptionId);
		expect(poll.data.ownAnswer).to.be.undefined;
		expect(poll.data.latest_answers).to.eql(
			originalState.latest_answers.filter((a) => a.id !== removedAnswer.id),
		);
		expect(poll.data.latest_votes_by_option).to.eql(originalState.latest_votes_by_option);
		expect(poll.data.maxVotedOptionIds).to.eql(originalState.maxVotedOptionIds);
	});

	it('should fetch poll data when query is called', async () => {
		const mockPollResponse = {
			name: 'Test question',
			options: [{ id: 'option1', text: 'Option 1' }],
			own_votes: [],
			vote_counts_by_option: {},
			latest_answers: [],
		};

		const poll = new Poll({ client, poll: pollResponse });
		const getPollStub = sinon.stub(client, 'getPoll');
		getPollStub.resolves({ poll: mockPollResponse });
		const originalState = poll.data;
		await poll.query(pollResponse.id);

		expect(getPollStub.calledWith(pollResponse.id)).to.be.true;
		const { lastActivityAt: __, ...currentPollState } = poll.data;
		const { lastActivityAt: _, ...expectedPollState } = {
			...originalState,
			...mockPollResponse,
		};
		expect(currentPollState).to.eql(expectedPollState);
		getPollStub.restore();
	});

	it('should publish a notification and not cast vote if reached max votes allowed', async () => {
		const poll = new Poll({
			client,
			poll: { ...pollResponse, max_votes_allowed: user2Votes.length },
		});
		const option_id = 'ba933470-c0da-4b6f-a4d2-d2176ac0d4a8';
		const messageId = 'XXX';
		const removePollVoteSpy = vi
			.spyOn(client, 'removePollVote')
			.mockResolvedValue('removed');
		const castPollVoteSpy = vi
			.spyOn(client, 'castPollVote')
			.mockResolvedValue({ vote: { id: 'vote1', option_id, user_id: 'user1' } });
		const addInfoNotificationSpy = vi.spyOn(client.notifications, 'addInfo');

		await poll.castVote(option_id, messageId);

		expect(removePollVoteSpy).not.toHaveBeenCalled();
		expect(castPollVoteSpy).not.toHaveBeenCalled();
		expect(addInfoNotificationSpy).toHaveBeenCalledTimes(1);
	});

	it('should not remove oldest vote before casting a new one if not reached max votes allowed', async () => {
		const poll = new Poll({
			client,
			poll: { ...pollResponse, max_votes_allowed: user2Votes.length + 1 },
		});
		const option_id = 'ba933470-c0da-4b6f-a4d2-d2176ac0d4a8';
		const messageId = 'XXX';
		const removePollVoteSpy = vi
			.spyOn(client, 'removePollVote')
			.mockResolvedValue('removed');
		const castPollVoteSpy = vi
			.spyOn(client, 'castPollVote')
			.mockResolvedValue({ vote: { id: 'vote1', option_id, user_id: 'user1' } });
		const addInfoNotificationSpy = vi.spyOn(client.notifications, 'addInfo');

		await poll.castVote(option_id, messageId);

		expect(removePollVoteSpy).not.toHaveBeenCalled();
		expect(castPollVoteSpy).toHaveBeenCalledWith(messageId, pollResponse.id, {
			option_id,
		});
		expect(addInfoNotificationSpy).not.toHaveBeenCalled();
	});

	it('should not remove oldest vote before casting a new one if max_votes_allowed is not defined', async () => {
		const poll = new Poll({
			client,
			poll: { ...pollResponse, max_votes_allowed: undefined },
		});
		const option_id = 'ba933470-c0da-4b6f-a4d2-d2176ac0d4a8';
		const messageId = 'XXX';
		const removePollVoteSpy = vi
			.spyOn(client, 'removePollVote')
			.mockResolvedValue('removed');
		const castPollVoteSpy = vi
			.spyOn(client, 'castPollVote')
			.mockResolvedValue({ vote: { id: 'vote1', option_id, user_id: 'user1' } });
		const addInfoNotificationSpy = vi.spyOn(client.notifications, 'addInfo');

		await poll.castVote(option_id, messageId);

		expect(removePollVoteSpy).not.toHaveBeenCalled();
		expect(castPollVoteSpy).toHaveBeenCalledWith(messageId, pollResponse.id, {
			option_id,
		});
		expect(addInfoNotificationSpy).not.toHaveBeenCalled();
	});
});

describe('Poll optimistic updates', () => {
	const optionA = '85610252-7d50-429c-8183-51a7eba46246'; // 2 votes, own vote
	const optionC = 'ba933470-c0da-4b6f-a4d2-d2176ac0d4a8'; // 0 votes
	const optionD = 'dc22dcd6-4fc8-4c92-92c2-bfd63245724c'; // 1 vote, own vote
	const messageId = 'message-id';

	const deferred = () => {
		let resolve;
		let reject;
		const promise = new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return { promise, reject, resolve };
	};

	const createPoll = (overrides = {}) => {
		client.user = user1;
		client.userID = user1.id;
		return new Poll({
			client,
			poll: { ...pollResponse, max_votes_allowed: 3, ...overrides },
		});
	};

	const serverVote = (optionId, id = 'server-vote-id') => ({
		poll_id: pollId,
		id,
		option_id: optionId,
		user_id: user1.id,
		user: user1,
		created_at: '2024-10-24T10:00:00.000000Z',
		updated_at: '2024-10-24T10:00:00.000000Z',
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('castVote', () => {
		it('applies the vote before the request resolves', async () => {
			const poll = createPoll();
			const request = deferred();
			vi.spyOn(client, 'castPollVote').mockReturnValue(request.promise);
			const before = poll.data;

			const castPromise = poll.castVote(optionC, messageId);

			const localVote = poll.data.ownVotesByOptionId[optionC];
			expect(localVote.id).toMatch(/^local-/);
			expect(localVote.user_id).toBe(user1.id);
			expect(poll.data.vote_count).toBe(before.vote_count + 1);
			expect(poll.data.vote_counts_by_option[optionC]).toBe(1);
			expect(poll.data.latest_votes_by_option[optionC]).toEqual([localVote]);
			expect(poll.data.maxVotedOptionIds).toEqual([optionA]);
			// previous state objects are not mutated
			expect(before.ownVotesByOptionId[optionC]).toBeUndefined();
			expect(before.vote_counts_by_option[optionC]).toBeUndefined();

			request.resolve({ vote: serverVote(optionC) });
			await castPromise;
			// a successful response does not touch the state
			expect(poll.data.ownVotesByOptionId[optionC]).toBe(localVote);
		});

		it('changes the existing vote in polls with unique votes', () => {
			const poll = createPoll({
				enforce_unique_vote: true,
				max_votes_allowed: undefined,
				own_votes: [user1Votes[0]],
			});
			vi.spyOn(client, 'castPollVote').mockReturnValue(new Promise(() => {}));
			const before = poll.data;

			poll.castVote(optionC, messageId);

			expect(Object.keys(poll.data.ownVotesByOptionId)).toEqual([optionC]);
			expect(poll.data.vote_count).toBe(before.vote_count);
			expect(poll.data.vote_counts_by_option[optionA]).toBe(
				before.vote_counts_by_option[optionA] - 1,
			);
			expect(poll.data.vote_counts_by_option[optionC]).toBe(1);
			expect(
				poll.data.latest_votes_by_option[optionA].map((vote) => vote.id),
			).not.toContain(user1Votes[0].id);
		});

		it('does not touch latest votes in anonymous polls', () => {
			const poll = createPoll({
				latest_votes_by_option: null,
				voting_visibility: 'anonymous',
			});
			vi.spyOn(client, 'castPollVote').mockReturnValue(new Promise(() => {}));

			poll.castVote(optionC, messageId);

			expect(poll.data.latest_votes_by_option).toBeNull();
			expect(poll.data.vote_counts_by_option[optionC]).toBe(1);
		});

		it('does not apply anything optimistically when the option already has an own vote', async () => {
			const poll = createPoll();
			vi.spyOn(client, 'castPollVote').mockResolvedValue({ vote: serverVote(optionA) });
			const before = poll.data;

			await poll.castVote(optionA, messageId);

			expect(poll.data).toBe(before);
		});

		it('reverts the vote when the request fails', async () => {
			const poll = createPoll({
				enforce_unique_vote: true,
				max_votes_allowed: undefined,
				own_votes: [user1Votes[0]],
			});
			const error = new Error('failed');
			vi.spyOn(client, 'castPollVote').mockRejectedValue(error);
			const before = poll.data;

			await expect(poll.castVote(optionC, messageId)).rejects.toBe(error);

			expect(poll.data.ownVotesByOptionId).toEqual(before.ownVotesByOptionId);
			expect(poll.data.vote_count).toBe(before.vote_count);
			expect(poll.data.vote_counts_by_option).toEqual({
				...before.vote_counts_by_option,
				[optionC]: 0,
			});
			expect(poll.data.maxVotedOptionIds).toEqual(before.maxVotedOptionIds);
			expect(poll.data.latest_votes_by_option[optionC]).toEqual([]);
			expect(poll.data.latest_votes_by_option[optionA].map((vote) => vote.id)).toContain(
				user1Votes[0].id,
			);
		});

		it('lets the WS event replace the local vote', async () => {
			const poll = createPoll();
			const request = deferred();
			vi.spyOn(client, 'castPollVote').mockReturnValue(request.promise);
			const castPromise = poll.castVote(optionC, messageId);
			const vote = serverVote(optionC);
			const vote_counts_by_option = {
				...pollResponse.vote_counts_by_option,
				[optionC]: 5,
			};

			poll.handleVoteCasted({
				type: 'poll.vote_casted',
				created_at: '2024-10-24T10:00:00.000000Z',
				poll: { ...pollResponse, vote_count: 9, vote_counts_by_option },
				poll_vote: vote,
			});

			expect(poll.data.ownVotesByOptionId[optionC]).toBe(vote);
			expect(poll.data.vote_count).toBe(9);
			expect(poll.data.vote_counts_by_option).toEqual(vote_counts_by_option);

			// a late failure does not revert server-confirmed state
			request.reject(new Error('failed'));
			await expect(castPromise).rejects.toThrow('failed');
			expect(poll.data.ownVotesByOptionId[optionC]).toBe(vote);
			expect(poll.data.vote_count).toBe(9);
		});
	});

	describe('removeVote', () => {
		it('removes the vote before the request resolves', async () => {
			const poll = createPoll();
			const request = deferred();
			const removePollVoteSpy = vi
				.spyOn(client, 'removePollVote')
				.mockReturnValue(request.promise);
			const before = poll.data;
			const vote = before.ownVotesByOptionId[optionD];

			const removePromise = poll.removeVote(vote.id, messageId);

			expect(poll.data.ownVotesByOptionId[optionD]).toBeUndefined();
			expect(poll.data.vote_count).toBe(before.vote_count - 1);
			expect(poll.data.vote_counts_by_option[optionD]).toBe(0);
			expect(poll.data.latest_votes_by_option[optionD]).toEqual([]);
			expect(poll.data.maxVotedOptionIds).toEqual([optionA]);

			request.resolve({ vote });
			await removePromise;
			expect(removePollVoteSpy).toHaveBeenCalledWith(messageId, pollId, vote.id);
		});

		it('restores the vote when the request fails', async () => {
			const poll = createPoll();
			const error = new Error('failed');
			vi.spyOn(client, 'removePollVote').mockRejectedValue(error);
			const before = poll.data;
			const vote = before.ownVotesByOptionId[optionD];

			await expect(poll.removeVote(vote.id, messageId)).rejects.toBe(error);

			expect(poll.data.ownVotesByOptionId).toEqual(before.ownVotesByOptionId);
			expect(poll.data.vote_count).toBe(before.vote_count);
			expect(poll.data.vote_counts_by_option).toEqual(before.vote_counts_by_option);
			expect(poll.data.maxVotedOptionIds).toEqual(before.maxVotedOptionIds);
		});

		it('waits for an in-flight cast and removes the vote by its real id', async () => {
			const poll = createPoll();
			const castRequest = deferred();
			vi.spyOn(client, 'castPollVote').mockReturnValue(castRequest.promise);
			const removePollVoteSpy = vi
				.spyOn(client, 'removePollVote')
				.mockResolvedValue({ vote: serverVote(optionC) });
			const before = poll.data;

			const castPromise = poll.castVote(optionC, messageId);
			const localVote = poll.data.ownVotesByOptionId[optionC];
			const removePromise = poll.removeVote(localVote.id, messageId);

			expect(poll.data.ownVotesByOptionId[optionC]).toBeUndefined();
			expect(poll.data.vote_count).toBe(before.vote_count);
			expect(removePollVoteSpy).not.toHaveBeenCalled();

			castRequest.resolve({ vote: serverVote(optionC, 'real-id') });
			await Promise.all([castPromise, removePromise]);

			expect(removePollVoteSpy).toHaveBeenCalledWith(messageId, pollId, 'real-id');
		});

		it('does not send a request when the in-flight cast fails', async () => {
			const poll = createPoll();
			const castRequest = deferred();
			vi.spyOn(client, 'castPollVote').mockReturnValue(castRequest.promise);
			const removePollVoteSpy = vi.spyOn(client, 'removePollVote');
			const before = poll.data;

			const castPromise = poll.castVote(optionC, messageId);
			const localVote = poll.data.ownVotesByOptionId[optionC];
			const removePromise = poll.removeVote(localVote.id, messageId);

			castRequest.reject(new Error('failed'));
			await expect(castPromise).rejects.toThrow('failed');
			await expect(removePromise).resolves.toBeUndefined();

			expect(removePollVoteSpy).not.toHaveBeenCalled();
			expect(poll.data.ownVotesByOptionId).toEqual(before.ownVotesByOptionId);
			expect(poll.data.vote_count).toBe(before.vote_count);
		});
	});

	describe('close', () => {
		it('closes the poll before the request resolves', async () => {
			const poll = createPoll();
			const request = deferred();
			vi.spyOn(client, 'closePoll').mockReturnValue(request.promise);

			const closePromise = poll.close();

			expect(poll.data.is_closed).toBe(true);
			request.resolve({ poll: { ...pollResponse, is_closed: true } });
			await closePromise;
			expect(poll.data.is_closed).toBe(true);
		});

		it('reopens the poll when the request fails', async () => {
			const poll = createPoll();
			const error = new Error('failed');
			vi.spyOn(client, 'closePoll').mockRejectedValue(error);

			await expect(poll.close()).rejects.toBe(error);

			expect(poll.data.is_closed).toBeFalsy();
		});

		it('does not send a request when the poll is already closed', async () => {
			const poll = createPoll({ is_closed: true });
			const closePollSpy = vi.spyOn(client, 'closePoll');
			const before = poll.data;

			await expect(poll.close()).resolves.toBeUndefined();

			expect(closePollSpy).not.toHaveBeenCalled();
			expect(poll.data).toBe(before);
		});

		it('keeps the poll closed when the close was confirmed by a WS event', async () => {
			const poll = createPoll();
			const request = deferred();
			vi.spyOn(client, 'closePoll').mockReturnValue(request.promise);

			const closePromise = poll.close();
			poll.handlePollClosed({
				type: 'poll.closed',
				created_at: '2024-10-24T10:00:00.000000Z',
				poll: { ...pollResponse, is_closed: true },
			});
			request.reject(new Error('failed'));

			await expect(closePromise).rejects.toThrow('failed');
			expect(poll.data.is_closed).toBe(true);
		});
	});

	it('handleVoteCasted produces a new ownVotesByOptionId object', () => {
		const poll = createPoll();
		const before = poll.data.ownVotesByOptionId;

		poll.handleVoteCasted({
			type: 'poll.vote_casted',
			created_at: '2024-10-24T10:00:00.000000Z',
			poll: pollResponse,
			poll_vote: serverVote(optionC),
		});

		expect(poll.data.ownVotesByOptionId).not.toBe(before);
		expect(before[optionC]).toBeUndefined();
	});
});
