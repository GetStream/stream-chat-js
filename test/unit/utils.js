import chai from 'chai';
import { axiosParamsSerializer, formatMessage, messageSetPagination, normalizeQuerySort } from '../../src/utils';
import sinon from 'sinon';

const expect = chai.expect;

describe('generateUUIDv4', () => {
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

describe('test if sort is deterministic', () => {
	it('test sort object', () => {
		let sort = normalizeQuerySort({
			created_at: 1,
			has_unread: -1,
		});
		expect(sort).to.have.length(2);
		expect(sort[0].field).to.be.equal('created_at');
		expect(sort[0].direction).to.be.equal(1);
		expect(sort[1].field).to.be.equal('has_unread');
		expect(sort[1].direction).to.be.equal(-1);
		sort = normalizeQuerySort({
			has_unread: -1,
			created_at: 1,
		});
		expect(sort[0].field).to.be.equal('has_unread');
		expect(sort[0].direction).to.be.equal(-1);
		expect(sort[1].field).to.be.equal('created_at');
		expect(sort[1].direction).to.be.equal(1);
	});
	it('test sort array', () => {
		let sort = normalizeQuerySort([{ created_at: 1 }, { has_unread: -1 }]);
		expect(sort).to.have.length(2);
		expect(sort[0].field).to.be.equal('created_at');
		expect(sort[0].direction).to.be.equal(1);
		expect(sort[1].field).to.be.equal('has_unread');
		expect(sort[1].direction).to.be.equal(-1);
		sort = normalizeQuerySort([{ has_unread: -1 }, { created_at: 1 }]);
		expect(sort[0].field).to.be.equal('has_unread');
		expect(sort[0].direction).to.be.equal(-1);
		expect(sort[1].field).to.be.equal('created_at');
		expect(sort[1].direction).to.be.equal(1);
	});
	it('test sort array with multi-field objects', () => {
		let sort = normalizeQuerySort([
			{ created_at: 1, has_unread: -1 },
			{ last_active: 1, deleted_at: -1 },
		]);
		expect(sort).to.have.length(4);
		expect(sort[0].field).to.be.equal('created_at');
		expect(sort[0].direction).to.be.equal(1);
		expect(sort[1].field).to.be.equal('has_unread');
		expect(sort[1].direction).to.be.equal(-1);
		expect(sort[2].field).to.be.equal('last_active');
		expect(sort[2].direction).to.be.equal(1);
		expect(sort[3].field).to.be.equal('deleted_at');
		expect(sort[3].direction).to.be.equal(-1);
	});
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

		expect(message.reaction_groups).to.deep.equal({
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

describe('message set pagination indicators', () => {
	const returnedMoreThanRequested = { requestedPageSize: 1, returnedPageSize: 2 };
	const returnedCountAsRequested = { requestedPageSize: 2, returnedPageSize: 2 };
	const returnedLessThanRequested = { requestedPageSize: 2, returnedPageSize: 1 };

	describe('hasPrev is enabled', () => {
		const currentPagination = { hasNext: false, hasPrev: false };
		const expectedPagination = { hasNext: false, hasPrev: true };
		[returnedMoreThanRequested, returnedCountAsRequested].forEach((requestedToReturned) => {
			describe(
				requestedToReturned.returnedPageSize > requestedToReturned.requestedPageSize
					? 'returned more than requested'
					: 'returned as requested',
				() => {
					const params = { currentPagination, ...requestedToReturned };

					it('missing message pagination options', () => {
						expect(messageSetPagination(params)).to.eql(expectedPagination);
					});
					it('message pagination options with id_lt', () => {
						expect(messageSetPagination({ messagePaginationOptions: { id_lt: 'X' }, ...params })).to.eql(
							expectedPagination,
						);
					});
					it('message pagination options with id_lte', () => {
						expect(messageSetPagination({ messagePaginationOptions: { id_lte: 'X' }, ...params })).to.eql(
							expectedPagination,
						);
					});
					it('message pagination options with created_at_before', () => {
						expect(
							messageSetPagination({ messagePaginationOptions: { created_at_before: 'X' }, ...params }),
						).to.eql(expectedPagination);
					});
					it('message pagination options with created_at_before_or_equal', () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: { created_at_before_or_equal: 'X' },
								...params,
							}),
						).to.eql(expectedPagination);
					});
				},
			);
		});
	});

	describe('hasPrev is disabled', () => {
		const currentPagination = { hasNext: false, hasPrev: true };
		const expectedPagination = { hasNext: false, hasPrev: false };
		describe('returned less than requested', () => {
			const params = { currentPagination, ...returnedLessThanRequested };

			it('missing message pagination options', () => {
				expect(messageSetPagination(params)).to.eql(expectedPagination);
			});
			it('message pagination options with id_lt', () => {
				expect(messageSetPagination({ messagePaginationOptions: { id_lt: 'X' }, ...params })).to.eql(
					expectedPagination,
				);
			});
			it('message pagination options with id_lte', () => {
				expect(messageSetPagination({ messagePaginationOptions: { id_lte: 'X' }, ...params })).to.eql(
					expectedPagination,
				);
			});
			it('message pagination options with created_at_before', () => {
				expect(
					messageSetPagination({ messagePaginationOptions: { created_at_before: 'X' }, ...params }),
				).to.eql(expectedPagination);
			});
			it('message pagination options with created_at_before_or_equal', () => {
				expect(
					messageSetPagination({
						messagePaginationOptions: { created_at_before_or_equal: 'X' },
						...params,
					}),
				).to.eql(expectedPagination);
			});
		});
	});
	describe('hasNext is enabled', () => {
		const currentPagination = { hasNext: false, hasPrev: false };
		const expectedPagination = { hasNext: true, hasPrev: false };

		[returnedMoreThanRequested, returnedCountAsRequested].forEach((requestedToReturned) => {
			describe(
				requestedToReturned.returnedPageSize > requestedToReturned.requestedPageSize
					? 'returned more than requested'
					: 'returned as requested',
				() => {
					const params = { currentPagination, ...requestedToReturned };

					it('message pagination options with id_gt', () => {
						expect(messageSetPagination({ messagePaginationOptions: { id_gt: 'X' }, ...params })).to.eql(
							expectedPagination,
						);
					});
					it('message pagination options with id_gte', () => {
						expect(messageSetPagination({ messagePaginationOptions: { id_gte: 'X' }, ...params })).to.eql(
							expectedPagination,
						);
					});
					it('message pagination options with created_at_after', () => {
						expect(
							messageSetPagination({ messagePaginationOptions: { created_at_after: 'X' }, ...params }),
						).to.eql(expectedPagination);
					});
					it('message pagination options with created_at_after_or_equal', () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: { created_at_after_or_equal: 'X' },
								...params,
							}),
						).to.eql(expectedPagination);
					});
				},
			);
		});
	});
	describe('hasNext is disabled', () => {
		const currentPagination = { hasNext: true, hasPrev: true };
		const expectedPagination = { hasNext: false, hasPrev: true };
		describe('returned less than requested', () => {
			const params = { currentPagination, ...returnedLessThanRequested };
			it('message pagination options with id_gt', () => {
				expect(messageSetPagination({ messagePaginationOptions: { id_gt: 'X' }, ...params })).to.eql(
					expectedPagination,
				);
			});
			it('message pagination options with id_gte', () => {
				expect(messageSetPagination({ messagePaginationOptions: { id_gte: 'X' }, ...params })).to.eql(
					expectedPagination,
				);
			});
			it('message pagination options with created_at_after', () => {
				expect(messageSetPagination({ messagePaginationOptions: { created_at_after: 'X' }, ...params })).to.eql(
					expectedPagination,
				);
			});
			it('message pagination options with created_at_after_or_equal', () => {
				expect(
					messageSetPagination({
						messagePaginationOptions: { created_at_after_or_equal: 'X' },
						...params,
					}),
				).to.eql(expectedPagination);
			});
		});
	});

	describe('does not change', () => {
		[
			['returned more than requested', returnedMoreThanRequested],
			['returned as requested', returnedCountAsRequested],
			['returned less than requested', returnedLessThanRequested],
		].forEach(([scenario, requestedToReturned]) => {
			describe(scenario, () => {
				const params = { currentPagination: {}, ...requestedToReturned };
				it('is provided unrecognized pagination options', () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: { XY: 'X' },
							...params,
						}),
					).to.eql({});
				});
			});
		});
	});
});
