import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Poll, StreamChat } from '../../src';

/**
 * Simulates the current user tapping poll options quickly while other users vote at the same time,
 * against a fake server that behaves like the backend: unique polls move a vote (vote_changed),
 * casting on an option that already has the user's vote returns that vote, removing a missing vote
 * fails, and WS events are delivered in order. Every run is seeded, so failures are reproducible.
 */

const OPTIONS = ['a', 'b', 'c'];
const OTHER_USERS = ['u1', 'u2', 'u3'];
const ME = 'me';

const createRandom = (seed) => {
	let value = seed;
	return () => (value = (value * 16807) % 2147483647) / 2147483647;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sortedJson = (object) =>
	JSON.stringify(Object.fromEntries(Object.entries(object ?? {}).sort()));

const runScenario = async ({
	dropRate,
	failRate,
	otherActions,
	seed,
	tapCount,
	unique,
}) => {
	const random = createRandom(seed);
	const pick = (list) => list[Math.floor(random() * list.length)];
	const latency = () => 5 + Math.floor(random() * 75);

	const client = new StreamChat('apiKey');
	client.userID = ME;
	client.user = { id: ME };
	const pollResponse = {
		answers_count: 0,
		created_at: '2024-10-22T15:28:20.580523Z',
		created_by: { id: ME },
		created_by_id: ME,
		enforce_unique_vote: unique,
		id: 'poll',
		latest_answers: [],
		latest_votes_by_option: {},
		name: 'Poll',
		options: OPTIONS.map((id) => ({ id })),
		own_votes: [],
		updated_at: '2024-10-22T15:28:20.580523Z',
		vote_count: 0,
		vote_counts_by_option: {},
		voting_visibility: 'public',
	};
	const poll = new Poll({ client, poll: pollResponse });

	// the fake server: votes by user and option
	const votes = Object.fromEntries(
		[ME, ...OTHER_USERS, 'late'].map((user) => [user, {}]),
	);
	let nextVoteId = 0;
	const voteCounts = () => {
		const counts = {};
		for (const userVotes of Object.values(votes)) {
			for (const optionId of Object.keys(userVotes))
				counts[optionId] = (counts[optionId] ?? 0) + 1;
		}
		return counts;
	};

	// a WS connection delivers events strictly in the order they were sent
	let deliveries = Promise.resolve();
	const emit = (type, vote) => {
		if (vote.user_id === ME && random() < dropRate) return;
		const counts = voteCounts();
		const event = {
			created_at: new Date().toISOString(),
			poll: {
				...pollResponse,
				vote_count: Object.values(counts).reduce((sum, count) => sum + count, 0),
				vote_counts_by_option: counts,
			},
			poll_vote: vote,
			type,
		};
		deliveries = deliveries
			.then(() => sleep(Math.floor(latency() / 4)))
			.then(() => {
				if (type === 'poll.vote_casted') poll.handleVoteCasted(event);
				else if (type === 'poll.vote_changed') poll.handleVoteChanged(event);
				else poll.handleVoteRemoved(event);
			});
	};

	const castOnServer = (user, optionId) => {
		const userVotes = votes[user];
		if (userVotes[optionId]) return userVotes[optionId];
		const existing = Object.values(userVotes)[0];
		if (unique && existing) {
			delete userVotes[existing.option_id];
			const moved = { ...existing, option_id: optionId };
			userVotes[optionId] = moved;
			emit('poll.vote_changed', moved);
			return moved;
		}
		const vote = {
			created_at: 'x',
			id: `vote-${nextVoteId++}`,
			option_id: optionId,
			poll_id: 'poll',
			updated_at: 'x',
			user_id: user,
		};
		userVotes[optionId] = vote;
		emit('poll.vote_casted', vote);
		return vote;
	};

	const removeOnServer = (user, voteId) => {
		const vote = Object.values(votes[user]).find(({ id }) => id === voteId);
		if (!vote) throw new Error('vote does not exist');
		delete votes[user][vote.option_id];
		emit('poll.vote_removed', vote);
		return vote;
	};

	const request = (handle) =>
		sleep(latency()).then(() => {
			if (random() < failRate) throw new Error('network error'); // never reaches the server
			return sleep(latency()).then(handle);
		});
	vi.spyOn(client, 'castPollVote').mockImplementation((_, __, { option_id }) =>
		request(() => ({ vote: castOnServer(ME, option_id) })),
	);
	vi.spyOn(client, 'removePollVote').mockImplementation((_, __, voteId) =>
		request(() => ({ vote: removeOnServer(ME, voteId) })),
	);

	// checked on every state change
	const inconsistencies = new Set();
	const unsubscribe = poll.state.subscribe((state) => {
		const counts = state.vote_counts_by_option ?? {};
		for (const [optionId, count] of Object.entries(counts)) {
			if (count < 0) inconsistencies.add(`negative count on ${optionId}`);
		}
		for (const optionId of Object.keys(state.ownVotesByOptionId)) {
			if (!(counts[optionId] >= 1))
				inconsistencies.add(`own vote on ${optionId} without a count`);
		}
		if (unique && Object.keys(state.ownVotesByOptionId).length > 1) {
			inconsistencies.add('several own votes in a poll with unique votes');
		}
		const sum = Object.values(counts).reduce((total, count) => total + count, 0);
		if (sum !== state.vote_count)
			inconsistencies.add('vote_count does not match the counts');
	});

	const otherUsersVoting = (async () => {
		for (let i = 0; i < otherActions; i++) {
			await sleep(Math.floor(random() * 30));
			const user = pick(OTHER_USERS);
			const optionId = pick(OPTIONS);
			const vote = votes[user][optionId];
			if (vote && random() < 0.5) removeOnServer(user, vote.id);
			else castOnServer(user, optionId);
		}
	})();

	// taps the way the UI toggles a vote; `intended` is what the user expects to end up with
	let intended = new Set();
	const tap = (optionId) => {
		const vote = poll.data.ownVotesByOptionId[optionId];
		if (vote) {
			intended.delete(optionId);
		} else {
			intended = unique ? new Set([optionId]) : new Set([...intended, optionId]);
		}
		return (
			vote ? poll.removeVote(vote.id, 'message') : poll.castVote(optionId, 'message')
		).catch(() => undefined);
	};
	// quick taps, often on the same option again
	const tapped = [];
	let optionId = pick(OPTIONS);
	for (let i = 0; i < tapCount; i++) {
		if (random() < 0.5) optionId = pick(OPTIONS);
		tapped.push(tap(optionId));
		await sleep(Math.floor(random() * 20));
	}
	await Promise.all([...tapped, otherUsersVoting]);
	// the WS events of the own votes, and the catch-up timeout for dropped ones
	await sleep(4000);
	const ownVoteIds = (ownVotes) =>
		Object.fromEntries(
			Object.entries(ownVotes).map(([optionId, vote]) => [optionId, vote.id]),
		);
	const snapshot = () => ({
		server: {
			counts: sortedJson(voteCounts()),
			ownVotes: sortedJson(ownVoteIds(votes[ME])),
		},
		shown: {
			counts: sortedJson(poll.data.vote_counts_by_option),
			ownVotes: sortedJson(ownVoteIds(poll.data.ownVotesByOptionId)),
		},
	});
	// without lost events, everything is up to date without waiting for another event
	const settled = snapshot();
	// a vote of a user who did not vote yet always sends an event, which brings the server's counts
	castOnServer('late', 'a');
	await sleep(200);
	unsubscribe();

	return {
		settled,
		inconsistencies: [...inconsistencies],
		intendedOwnVotes: JSON.stringify([...intended].sort()),
		serverOwnVoteOptions: JSON.stringify(Object.keys(votes[ME]).sort()),
		server: {
			counts: sortedJson(voteCounts()),
			ownVotes: sortedJson(ownVoteIds(votes[ME])),
		},
		shown: {
			counts: sortedJson(poll.data.vote_counts_by_option),
			ownVotes: sortedJson(ownVoteIds(poll.data.ownVotesByOptionId)),
		},
	};
};

const scenarios = Array.from({ length: 40 }, (_, i) => ({
	index: i,
	name: `${i % 2 ? 'multiple votes' : 'unique votes'} #${i}`,
	tapCount: 2 + (i % 7),
	unique: i % 2 === 0,
}));

const runAll = async (network) => {
	const runs = scenarios.flatMap((scenario) =>
		[1, 2, 3, 4, 5].map((k) =>
			runScenario({
				...scenario,
				...network,
				otherActions: 12,
				seed: k * 104729 + scenario.index * 31,
			}).then((result) => ({ ...result, name: `${scenario.name}, seed ${k}` })),
		),
	);
	let settled = false;
	const results = Promise.all(runs).then((all) => {
		settled = true;
		return all;
	});
	while (!settled) await vi.advanceTimersByTimeAsync(20);
	return results;
};

describe('Poll optimistic votes with other users voting at the same time', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('stays consistent with the server on a reliable network', async () => {
		const results = await runAll({ dropRate: 0, failRate: 0 });

		const failures = results.filter(
			(r) =>
				r.inconsistencies.length ||
				JSON.stringify(r.settled.shown) !== JSON.stringify(r.settled.server) ||
				JSON.stringify(r.shown) !== JSON.stringify(r.server),
		);
		expect(failures).toEqual([]);
	});

	it('ends with the votes the user tapped last on a reliable network', async () => {
		const results = await runAll({ dropRate: 0, failRate: 0 });

		const failures = results.filter((r) => r.serverOwnVoteOptions !== r.intendedOwnVotes);
		expect(failures).toEqual([]);
	});

	it('stays consistent with the server when vote requests fail', async () => {
		const results = await runAll({ dropRate: 0, failRate: 0.15 });

		const failures = results.filter(
			(r) =>
				r.inconsistencies.length ||
				JSON.stringify(r.settled.shown) !== JSON.stringify(r.settled.server) ||
				JSON.stringify(r.shown) !== JSON.stringify(r.server),
		);
		expect(failures).toEqual([]);
	});

	it('ends consistent with the server when vote requests fail and own WS events get lost', async () => {
		const results = await runAll({ dropRate: 0.1, failRate: 0.15 });

		const failures = results.filter(
			(r) => JSON.stringify(r.shown) !== JSON.stringify(r.server),
		);
		expect(failures).toEqual([]);
	});
});
