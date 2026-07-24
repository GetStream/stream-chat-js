import {
	axiosParamsSerializer,
	formatMessage,
	normalizeQuerySort,
} from '../../src/utils';
import sinon from 'sinon';

import { describe, beforeEach, it, expect } from 'vitest';

describe.skip('generateUUIDv4', () => {
	beforeEach(() => {
		sinon.restore();
	});

	// TODO: check if this test is fixable. Latest versions of node introduced support for crypto, and thus following test fails.
	// it('generates a UUID manually when crypto is unavailable', () => {
	// 	sinon.spy(Math, 'pow');
	// 	sinon.spy(Math, 'random');
	// 	const uuid = generateUUIDv4();
	// 	expect(uuid).to.be.a('string');
	// 	expect(uuid.length).to.equal(36);
	// 	expect(Math.pow.calledWithMatch(2, 8)).to.be.true;
	// 	expect(Math.random.callCount).to.be.equal(16);
	// });
});

describe('axiosParamsSerializer', () => {
	const testCases = [
		{
			input: {
				a: 1,
				b: 2,
				c: null,
				d: undefined,
			},
			output: 'a=1&b=2&c=null',
		},
		{
			input: {
				a: {
					b: 1,
					c: 2,
					d: null,
				},
				b: [1, 2, 3],
			},
			output: 'a=%7B%22b%22%3A1%2C%22c%22%3A2%2C%22d%22%3Anull%7D&b=%5B1%2C2%2C3%5D',
		},
	];
	it('should serialize params', () => {
		for (const { input, output } of testCases) {
			expect(axiosParamsSerializer(input)).to.equal(output);
		}
	});
});

describe('reaction groups fallback', () => {
	it('uses groups if present', () => {
		const date = '2024-04-30T11:03:39.217974Z';
		const groups = {
			love: {
				count: 1,
				sum_scores: 1,
				first_reaction_at: date,
				last_reaction_at: date,
			},
		};

		const message = formatMessage({ reaction_groups: groups });
		expect(message.reaction_groups).to.be.equal(groups);
	});

	it('falls back to counts + scores', () => {
		const counts = { love: 1, sad: 1 };
		const scores = { love: 1, sad: 2 };

		const message = formatMessage({
			reaction_groups: null,
			reaction_counts: counts,
			reaction_scores: scores,
		});

		expect(message.reaction_groups).toMatchObject({
			love: {
				count: 1,
				sum_scores: 1,
			},
			sad: {
				count: 1,
				sum_scores: 2,
			},
		});
	});
});
