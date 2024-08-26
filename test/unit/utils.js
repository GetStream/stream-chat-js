import chai from 'chai';
import {
	axiosParamsSerializer,
	binarySearchByDateEqualOrNearestGreater,
	formatMessage,
	messageSetPagination,
	normalizeQuerySort,
} from '../../src/utils';
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

describe('messageSetPagination', () => {
	const consoleErrorSpy = () => {
		const _consoleError = console.error;
		console.error = () => null;
		return () => {
			console.error = _consoleError;
		};
	};
	const messages = [
		{ created_at: '2024-08-05T08:55:00.199808Z', id: '0' },
		{ created_at: '2024-08-05T08:55:01.199808Z', id: '1' },
		{ created_at: '2024-08-05T08:55:02.199808Z', id: '2' },
		{ created_at: '2024-08-05T08:55:03.199808Z', id: '3' },
		{ created_at: '2024-08-05T08:55:04.199808Z', id: '4' },
		{ created_at: '2024-08-05T08:55:05.199808Z', id: '5' },
		{ created_at: '2024-08-05T08:55:06.199808Z', id: '6' },
		{ created_at: '2024-08-05T08:55:07.199808Z', id: '7' },
		{ created_at: '2024-08-05T08:55:08.199808Z', id: '8' },
	];

	describe('linear', () => {
		describe('returned page size size is 0', () => {
			['created_at_after_or_equal', 'created_at_after', 'id_gt', 'id_gte'].forEach((option) => {
				it(`requested page size === returned page size  ===  parent set size pagination with option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: [],
							parentSet: { messages: [], pagination: {} },
						}),
					).to.eql({ hasNext: false });
				});
				it(`requested page size === parent set size > returned page size with option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: 1,
							returnedPage: [],
							parentSet: { messages: messages.slice(0, 1), pagination: {} },
						}),
					).to.eql({ hasNext: false });
				});
				it(`returned page size === parent set size pagination < requested page size with option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: 1,
							returnedPage: [],
							parentSet: { messages: [], pagination: {} },
						}),
					).to.eql({ hasNext: false });
				});
				it(`requested page size === returned page size  <  parent set size pagination with option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: [],
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({ hasNext: false });
				});
				it(`returned page size < parent set size < requested page size pagination with option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: 1,
							returnedPage: [],
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({ hasNext: false });
				});
			});

			['created_at_before_or_equal', 'created_at_before', 'id_lt', 'id_lte', undefined, 'unrecognized'].forEach(
				(option) => {
					it(`requested page size === returned page size  ===  parent set size pagination with option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: [],
								parentSet: { messages: [], pagination: {} },
							}),
						).to.eql({ hasPrev: false });
					});
					it(`requested page size === parent set size > returned page size with option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: 1,
								returnedPage: [],
								parentSet: { messages: messages.slice(0, 1), pagination: {} },
							}),
						).to.eql({ hasPrev: false });
					});
					it(`returned page size === parent set size pagination < requested page size with option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: 1,
								returnedPage: [],
								parentSet: { messages: [], pagination: {} },
							}),
						).to.eql({ hasPrev: false });
					});
					it(`requested page size === returned page size  <  parent set size pagination with option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: [],
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({ hasPrev: false });
					});
					it(`returned page size < parent set size < requested page size pagination with option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: 1,
								returnedPage: [],
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({ hasPrev: false });
					});
				},
			);
		});

		['created_at_after_or_equal', 'created_at_after', 'id_gt', 'id_gte'].forEach((option) => {
			it(`requested page size === returned page size === parent set size pagination option ${option}`, () => {
				expect(
					messageSetPagination({
						messagePaginationOptions: option && { [option]: 'X' },
						requestedPageSize: messages.length,
						returnedPage: messages,
						parentSet: { messages, pagination: {} },
					}),
				).to.eql({ hasNext: true });
			});

			it(`returned page size === parent set size pagination < requested page size option ${option}`, () => {
				expect(
					messageSetPagination({
						messagePaginationOptions: option && { [option]: 'X' },
						requestedPageSize: messages.length + 1,
						returnedPage: messages,
						parentSet: { messages, pagination: {} },
					}),
				).to.eql({ hasNext: false });
			});

			it(`returned page size === parent set size pagination > requested page size option ${option}`, () => {
				expect(
					messageSetPagination({
						messagePaginationOptions: option && { [option]: 'X' },
						requestedPageSize: messages.length - 1,
						returnedPage: messages,
						parentSet: { messages, pagination: {} },
					}),
				).to.eql({ hasNext: true });
			});

			describe('first (oldest) page message matches the first parent set message', () => {
				it(`requested page size === returned page size  <  parent set size pagination option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length - 1,
							returnedPage: messages.slice(0, -1),
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({});
				});
				it(`requested page size === parent set size > returned page size option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: messages.slice(0, -1),
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({});
				});
				it(`requested page size < returned page size <  parent set size pagination option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length - 2,
							returnedPage: messages.slice(0, -1),
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({});
				});
				it(`requested page size < returned page size  <  parent set size pagination option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length - 3,
							returnedPage: messages.slice(0, -2),
							parentSet: { messages: messages.slice(0, -1), pagination: {} },
						}),
					).to.eql({});
				});
				it(`returned page size  <  parent set size < requested page size pagination option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: messages.slice(0, -2),
							parentSet: { messages: messages.slice(0, -1), pagination: {} },
						}),
					).to.eql({});
				});
				it(`requested page size === returned page size  >  parent set size pagination option ${option}`, () => {
					const restore = consoleErrorSpy();
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: messages,
							parentSet: { messages: messages.slice(0, -1), pagination: {} },
						}),
					).to.eql({});
					restore();
				});
				it(`parent set size < returned page size < requested page size pagination option ${option}`, () => {
					const restore = consoleErrorSpy();
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: messages.slice(0, -1),
							parentSet: { messages: messages.slice(0, -2), pagination: {} },
						}),
					).to.eql({});
					restore();
				});
				it(`requested page size <  parent set size < returned page size pagination option ${option}`, () => {
					const restore = consoleErrorSpy();
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length - 2,
							returnedPage: messages,
							parentSet: { messages: messages.slice(0, -1), pagination: {} },
						}),
					).to.eql({});
					restore();
				});
			});

			describe('last page message matches the last parent set message', () => {
				it(`requested page size === returned page size  <  parent set size pagination option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length - 1,
							returnedPage: messages.slice(1),
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({ hasNext: true });
				});
				it(`requested page size === parent set size > returned page size option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: messages.slice(1),
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({ hasNext: false });
				});
				it(`requested page size < returned page size <  parent set size pagination option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length - 2,
							returnedPage: messages.slice(1),
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({ hasNext: true });
				});
				it(`returned page size  <  parent set size < requested page size pagination option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: messages.slice(2),
							parentSet: { messages: messages.slice(1), pagination: {} },
						}),
					).to.eql({ hasNext: false });
				});
				it(`requested page size === returned page size  >  parent set size pagination option ${option}`, () => {
					const restore = consoleErrorSpy();
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: messages,
							parentSet: { messages: messages.slice(-1), pagination: {} },
						}),
					).to.eql({});
					restore();
				});
				it(`parent set size < returned page size < requested page size pagination option ${option}`, () => {
					const restore = consoleErrorSpy();
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: messages.slice(1),
							parentSet: { messages: messages.slice(2), pagination: {} },
						}),
					).to.eql({});
					restore();
				});
				it(`requested page size <  parent set size < returned page size pagination option ${option}`, () => {
					const restore = consoleErrorSpy();
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length - 2,
							returnedPage: messages,
							parentSet: { messages: messages.slice(1), pagination: {} },
						}),
					).to.eql({});
					restore();
				});
			});

			describe('first page message & last page message do not match the first and last parent set messages', () => {
				it(`requested page size === returned page size  ===  parent set size pagination option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: [
								messages[1],
								messages[0],
								...messages.slice(2, -2),
								messages.slice(-1)[0],
								messages.slice(-2, -1)[0],
							],
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({});
				});
				it(`requested page size === parent set size > returned page size option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: messages.slice(1, -1),
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({});
				});
				it(`returned page size === parent set size pagination < requested page size option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length + 1,
							returnedPage: [
								messages[1],
								messages[0],
								...messages.slice(2, -2),
								messages.slice(-1)[0],
								messages.slice(-2, -1)[0],
							],
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({});
				});

				it(`returned page size === parent set size pagination > requested page size option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length - 1,
							returnedPage: [
								messages[1],
								messages[0],
								...messages.slice(2, -2),
								messages.slice(-1)[0],
								messages.slice(-2, -1)[0],
							],
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({});
				});

				it(`requested page size === returned page size  <  parent set size pagination option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length - 2,
							returnedPage: messages.slice(1, -1),
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({});
				});
				it(`requested page size < returned page size <  parent set size pagination option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length - 3,
							returnedPage: messages.slice(1, -1),
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({});
				});
				it(`returned page size < parent set size < requested page size pagination option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length + 1,
							returnedPage: messages.slice(1, -1),
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({});
				});
				it(`requested page size === returned page size  >  parent set size pagination option ${option}`, () => {
					const restore = consoleErrorSpy();
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: messages,
							parentSet: { messages: messages.slice(1, -1), pagination: {} },
						}),
					).to.eql({});
					restore();
				});
				it(`parent set size < returned page size < requested page size pagination option ${option}`, () => {
					const restore = consoleErrorSpy();
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: messages.slice(1),
							parentSet: { messages: messages.slice(1, -1), pagination: {} },
						}),
					).to.eql({});
					restore();
				});
				it(`requested page size <  parent set size < returned page size pagination option ${option}`, () => {
					const restore = consoleErrorSpy();
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length - 3,
							returnedPage: messages,
							parentSet: { messages: messages.slice(1, -1), pagination: {} },
						}),
					).to.eql({});
					restore();
				});
			});
		});

		['created_at_before_or_equal', 'created_at_before', 'id_lt', 'id_lte', undefined, 'unrecognized'].forEach(
			(option) => {
				it(`requested page size === returned page size === parent set size pagination option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length,
							returnedPage: messages,
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({ hasPrev: true });
				});

				it(`returned page size === parent set size pagination < requested page size option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length + 1,
							returnedPage: messages,
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({ hasPrev: false });
				});

				it(`returned page size === parent set size pagination > requested page size option ${option}`, () => {
					expect(
						messageSetPagination({
							messagePaginationOptions: option && { [option]: 'X' },
							requestedPageSize: messages.length - 1,
							returnedPage: messages,
							parentSet: { messages, pagination: {} },
						}),
					).to.eql({ hasPrev: true });
				});

				describe('first (oldest) page message matches the first parent set message', () => {
					it(`requested page size === returned page size  <  parent set size pagination option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length - 1,
								returnedPage: messages.slice(0, -1),
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({ hasPrev: true });
					});
					it(`requested page size < returned page size <  parent set size pagination option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length - 2,
								returnedPage: messages.slice(0, -1),
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({ hasPrev: true });
					});
					it(`requested page size === parent set size > returned page size option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: messages.slice(0, -1),
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({ hasPrev: false });
					});
					it(`requested page size < returned page size  <  parent set size pagination option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length - 3,
								returnedPage: messages.slice(0, -2),
								parentSet: { messages: messages.slice(0, -1), pagination: {} },
							}),
						).to.eql({ hasPrev: true });
					});
					it(`returned page size < parent set size < requested page size pagination option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: messages.slice(0, -2),
								parentSet: { messages: messages.slice(0, -1), pagination: {} },
							}),
						).to.eql({ hasPrev: false });
					});
					it(`requested page size === returned page size  >  parent set size pagination option ${option}`, () => {
						const restore = consoleErrorSpy();
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: messages,
								parentSet: { messages: messages.slice(0, -1), pagination: {} },
							}),
						).to.eql({});
						restore();
					});
					it(`parent set size < returned page size < requested page size pagination option ${option}`, () => {
						const restore = consoleErrorSpy();
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: messages.slice(0, -1),
								parentSet: { messages: messages.slice(0, -2), pagination: {} },
							}),
						).to.eql({});
						restore();
					});
					it(`requested page size <  parent set size < returned page size pagination option ${option}`, () => {
						const restore = consoleErrorSpy();
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length - 2,
								returnedPage: messages,
								parentSet: { messages: messages.slice(0, -1), pagination: {} },
							}),
						).to.eql({});
						restore();
					});
				});

				describe('last page message matches the last parent set message', () => {
					it(`requested page size === returned page size  <  parent set size pagination option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length - 1,
								returnedPage: messages.slice(1),
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({});
					});
					it(`requested page size === parent set size > returned page size option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: messages.slice(1),
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({});
					});
					it(`requested page size < returned page size <  parent set size pagination option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length - 2,
								returnedPage: messages.slice(1),
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({});
					});
					it(`returned page size < parent set size < requested page size pagination option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: messages.slice(2),
								parentSet: { messages: messages.slice(1), pagination: {} },
							}),
						).to.eql({});
					});
					it(`requested page size === returned page size  >  parent set size pagination option ${option}`, () => {
						const restore = consoleErrorSpy();
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: messages,
								parentSet: { messages: messages.slice(-1), pagination: {} },
							}),
						).to.eql({});
						restore();
					});
					it(`parent set size < returned page size < requested page size pagination option ${option}`, () => {
						const restore = consoleErrorSpy();
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: messages.slice(1),
								parentSet: { messages: messages.slice(2), pagination: {} },
							}),
						).to.eql({});
						restore();
					});
					it(`requested page size <  parent set size < returned page size pagination option ${option}`, () => {
						const restore = consoleErrorSpy();
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length - 2,
								returnedPage: messages,
								parentSet: { messages: messages.slice(1), pagination: {} },
							}),
						).to.eql({});
						restore();
					});
				});

				describe('first page message & last page message do not match the first and last parent set messages', () => {
					it(`requested page size === returned page size  ===  parent set size pagination option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: [
									messages[1],
									messages[0],
									...messages.slice(2, -2),
									messages.slice(-1)[0],
									messages.slice(-2, -1)[0],
								],
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({});
					});
					it(`requested page size === parent set size > returned page size option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: messages.slice(1, -1),
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({});
					});
					it(`returned page size === parent set size pagination < requested page size option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length + 1,
								returnedPage: [
									messages[1],
									messages[0],
									...messages.slice(2, -2),
									messages.slice(-1)[0],
									messages.slice(-2, -1)[0],
								],
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({});
					});

					it(`returned page size === parent set size pagination > requested page size option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length - 1,
								returnedPage: [
									messages[1],
									messages[0],
									...messages.slice(2, -2),
									messages.slice(-1)[0],
									messages.slice(-2, -1)[0],
								],
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({});
					});

					it(`requested page size === returned page size  <  parent set size pagination option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length - 2,
								returnedPage: messages.slice(1, -1),
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({});
					});
					it(`requested page size < returned page size <  parent set size pagination option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length - 3,
								returnedPage: messages.slice(1, -1),
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({});
					});
					it(`returned page size < parent set size < requested page size pagination option ${option}`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length + 1,
								returnedPage: messages.slice(1, -1),
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({});
					});
					it(`requested page size === returned page size  >  parent set size pagination option ${option}`, () => {
						const restore = consoleErrorSpy();
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: messages,
								parentSet: { messages: messages.slice(1, -1), pagination: {} },
							}),
						).to.eql({});
						restore();
					});
					it(`parent set size < returned page size < requested page size pagination option ${option}`, () => {
						const restore = consoleErrorSpy();
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length,
								returnedPage: messages.slice(1),
								parentSet: { messages: messages.slice(1, -1), pagination: {} },
							}),
						).to.eql({});
						restore();
					});
					it(`requested page size <  parent set size < returned page size pagination option ${option}`, () => {
						const restore = consoleErrorSpy();
						expect(
							messageSetPagination({
								messagePaginationOptions: option && { [option]: 'X' },
								requestedPageSize: messages.length - 3,
								returnedPage: messages,
								parentSet: { messages: messages.slice(1, -1), pagination: {} },
							}),
						).to.eql({});
						restore();
					});
				});
			},
		);
	});

	describe('jumping to a message', () => {
		const oddSizeReturnPage = messages;
		const evenSizeReturnPage = messages.slice(0, -1);
		const createdAtISOString = (index, msgs) =>
			new Date(new Date(msgs[index].created_at).getTime() - 500).toISOString();

		[
			{
				description: 'odd return page size',
				messages: oddSizeReturnPage,
				messagePaginationOptions: {
					firstHalf: { created_at_around: createdAtISOString(2, oddSizeReturnPage) },
					mid: { created_at_around: createdAtISOString(4, oddSizeReturnPage) },
					secondHalf: { created_at_around: createdAtISOString(6, oddSizeReturnPage) },
				},
				option: 'created_at_around',
			},
			{
				description: 'even return page size',
				messages: evenSizeReturnPage,
				messagePaginationOptions: {
					firstHalf: { created_at_around: createdAtISOString(2, evenSizeReturnPage) },
					mid: { created_at_around: createdAtISOString(4, evenSizeReturnPage) },
					secondHalf: { created_at_around: createdAtISOString(5, evenSizeReturnPage) },
				},
				option: 'created_at_around',
			},
			{
				description: 'odd return page size',
				messages: oddSizeReturnPage,
				messagePaginationOptions: {
					firstHalf: { id_around: oddSizeReturnPage[2].id },
					mid: { id_around: oddSizeReturnPage[4].id },
					secondHalf: { id_around: oddSizeReturnPage[6].id },
				},
				option: 'id_around',
			},
			{
				description: 'even return page size',
				messages: evenSizeReturnPage,
				messagePaginationOptions: {
					firstHalf: { id_around: evenSizeReturnPage[2].id },
					mid: { id_around: evenSizeReturnPage[4].id },
					secondHalf: { id_around: evenSizeReturnPage[5].id },
				},
				option: 'id_around',
			},
		].forEach(({ description, messagePaginationOptions, messages, option }) => {
			describe(description, () => {
				describe(`with ${option}`, () => {
					describe('the target msg is in the first page half', () => {
						it(`requested page size === returned page size === parent set size pagination`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: messagePaginationOptions.firstHalf,
									requestedPageSize: messages.length,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: false, hasNext: true });
						});

						it(`returned page size === parent set size pagination < requested page size`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: messagePaginationOptions.firstHalf,
									requestedPageSize: messages.length + 1,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: false, hasNext: false });
						});

						it(`returned page size === parent set size pagination > requested page size`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: messagePaginationOptions.firstHalf,
									requestedPageSize: messages.length - 1,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: false, hasNext: true });
						});

						describe('first (oldest) page message matches the first parent set message', () => {
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length - 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(0, -2),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  >  parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(0, -2),
										parentSet: { messages: messages.slice(0, -3), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length - 2,
										returnedPage: messages,
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});

						describe('last page message matches the last parent set message', () => {
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length - 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  >  parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(2),
										parentSet: { messages: messages.slice(3), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length - 2,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});

						describe('first page message & last page message do not match the first and last parent set messages', () => {
							it(`requested page size === returned page size  ===  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({});
							});
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length - 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`returned page size === parent set size pagination < requested page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length,
										returnedPage: [messages[0], ...messages.slice(2, -2), messages.slice(-1)[0]],
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`returned page size === parent set size pagination > requested page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length - 1,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({});
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({});
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length - 3,
										returnedPage: [
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({});
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length + 1,
										returnedPage: [messages[1], ...messages.slice(2, -2), messages.slice(-1)[0]],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  >  parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length,
										returnedPage: [messages[0], ...messages.slice(2, -2), messages.slice(-1)[0]],
										parentSet: { messages: messages.slice(1, -2), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.firstHalf,
										requestedPageSize: messages.length - 2,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});
					});

					describe('the target msg is in the middle of the page', () => {
						it(`requested page size === returned page size === parent set size pagination`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: messagePaginationOptions.mid,
									requestedPageSize: messages.length,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: true, hasNext: true });
						});

						it(`returned page size === parent set size pagination < requested page size`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: messagePaginationOptions.mid,
									requestedPageSize: messages.length + 1,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: false, hasNext: false });
						});

						it(`returned page size === parent set size pagination > requested page size`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: messagePaginationOptions.mid,
									requestedPageSize: messages.length - 1,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: true, hasNext: true });
						});

						describe('first (oldest) page message matches the first parent set message', () => {
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length - 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: true });
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: true });
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  >  parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1, -2), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length - 2,
										returnedPage: messages,
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});

						describe('last page message matches the last parent set message', () => {
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length - 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasNext: true });
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasNext: true });
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  >  parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(2, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length - 2,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});

						describe('first page message & last page message do not match the first and last parent set messages', () => {
							it(`requested page size === returned page size  ===  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({});
							});
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`returned page size === parent set size pagination < requested page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length + 1,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`returned page size === parent set size pagination > requested page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length - 1,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({});
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({});
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({});
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length + 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  >  parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length + 1,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.mid,
										requestedPageSize: messages.length - 3,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});
					});

					describe('the target msg is in the second page half', () => {
						it(`requested page size === returned page size === parent set size pagination`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: messagePaginationOptions.secondHalf,
									requestedPageSize: messages.length,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: true, hasNext: false });
						});

						it(`returned page size === parent set size pagination < requested page size`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: messagePaginationOptions.secondHalf,
									requestedPageSize: messages.length + 1,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: false, hasNext: false });
						});

						it(`returned page size === parent set size pagination > requested page size`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: messagePaginationOptions.secondHalf,
									requestedPageSize: messages.length - 1,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: true, hasNext: false });
						});

						describe('first (oldest) page message matches the first parent set message', () => {
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length - 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: true });
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: true });
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  >  parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1, -2), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length - 2,
										returnedPage: messages,
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});

						describe('last page message matches the last parent set message', () => {
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length - 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size > parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(2, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length - 2,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});

						describe('first page message & last page message do not match the first and last parent set messages', () => {
							it(`requested page size === returned page size  ===  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({});
							});
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`returned page size === parent set size pagination < requested page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length + 1,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`returned page size === parent set size pagination > requested page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length - 1,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({});
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({});
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({});
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length + 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  >  parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length + 1,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: messagePaginationOptions.secondHalf,
										requestedPageSize: messages.length - 3,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});
					});
				});

				describe('with created_at_around', () => {
					describe('the target msg created_at < the earliest parent set message creation date', () => {
						const created_at_around = '2000-08-05T08:55:00.199808Z';

						it(`requested page size === returned page size === parent set size pagination`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: { created_at_around },
									requestedPageSize: messages.length,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: false });
						});

						it(`returned page size === parent set size pagination < requested page size`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: { created_at_around },
									requestedPageSize: messages.length + 1,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: false, hasNext: false });
						});

						it(`returned page size === parent set size pagination > requested page size`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: { created_at_around },
									requestedPageSize: messages.length - 1,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: false });
						});

						describe('first (oldest) page message matches the first parent set message', () => {
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  >  parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1, -2), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 2,
										returnedPage: messages,
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});

						describe('last page message matches the last parent set message', () => {
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`requested page size < returned page size < parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size > parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(2, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 2,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});

						describe('first page message & last page message do not match the first and last parent set messages', () => {
							it(`requested page size === returned page size  ===  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`returned page size === parent set size pagination < requested page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length + 1,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`returned page size === parent set size pagination > requested page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 1,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false });
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length + 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  >  parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length + 1,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 3,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});
					});

					describe('the target msg created_at > the latest parent set message creation date', () => {
						const created_at_around = '3000-08-05T08:55:00.199808Z';

						it(`requested page size === returned page size === parent set size pagination`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: { created_at_around },
									requestedPageSize: messages.length,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasNext: false });
						});

						it(`returned page size === parent set size pagination < requested page size`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: { created_at_around },
									requestedPageSize: messages.length + 1,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasPrev: false, hasNext: false });
						});

						it(`returned page size === parent set size pagination > requested page size`, () => {
							expect(
								messageSetPagination({
									messagePaginationOptions: { created_at_around },
									requestedPageSize: messages.length - 1,
									returnedPage: messages,
									parentSet: { messages, pagination: {} },
								}),
							).to.eql({ hasNext: false });
						});

						describe('first (oldest) page message matches the first parent set message', () => {
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  >  parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(1, -2), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 2,
										returnedPage: messages,
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});

						describe('last page message matches the last parent set message', () => {
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`requested page size < returned page size < parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(0, -1), pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size > parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages: messages.slice(2, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 2,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});

						describe('first page message & last page message do not match the first and last parent set messages', () => {
							it(`requested page size === returned page size  ===  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`requested page size === parent set size > returned page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`returned page size === parent set size pagination < requested page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length + 1,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`returned page size === parent set size pagination > requested page size`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 1,
										returnedPage: [
											messages[1],
											messages[0],
											...messages.slice(2, -2),
											messages.slice(-1)[0],
											messages.slice(-2, -1)[0],
										],
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`requested page size === returned page size  <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 2,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`requested page size < returned page size <  parent set size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 3,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasNext: false });
							});
							it(`returned page size < parent set size < requested page size pagination`, () => {
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length + 1,
										returnedPage: messages.slice(1, -1),
										parentSet: { messages, pagination: {} },
									}),
								).to.eql({ hasPrev: false, hasNext: false });
							});
							it(`requested page size === returned page size  >  parent set size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`parent set size < returned page size < requested page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length + 1,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
							it(`requested page size <  parent set size < returned page size pagination`, () => {
								const restore = consoleErrorSpy();
								expect(
									messageSetPagination({
										messagePaginationOptions: { created_at_around },
										requestedPageSize: messages.length - 3,
										returnedPage: messages,
										parentSet: { messages: messages.slice(1, -1), pagination: {} },
									}),
								).to.eql({});
								restore();
							});
						});
					});
				});
			});
		});

		[
			{
				description: '0 return page size',
				messages: [],
				messagePaginationOptions: { created_at_around: createdAtISOString(2, oddSizeReturnPage) },
				option: 'created_at_around',
			},
			{
				description: '0 return page size',
				messages: [],
				messagePaginationOptions: { id_around: oddSizeReturnPage[4].id },
				option: 'id_around',
			},
		].forEach(({ description, messagePaginationOptions, messages, option }) => {
			describe(description, () => {
				describe(`with ${option}`, () => {
					it(`requested page size === returned page size  ===  parent set size pagination`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions: messagePaginationOptions,
								requestedPageSize: messages.length,
								returnedPage: messages,
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({});
					});
					it(`requested page size === parent set size > returned page size`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions,
								requestedPageSize: 1,
								returnedPage: messages,
								parentSet: { messages: evenSizeReturnPage.slice(0, 1), pagination: {} },
							}),
						).to.eql({ hasPrev: false, hasNext: false });
					});
					it(`returned page size === parent set size pagination < requested page size`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions,
								requestedPageSize: 1,
								returnedPage: messages,
								parentSet: { messages, pagination: {} },
							}),
						).to.eql({ hasPrev: false, hasNext: false });
					});
					it(`requested page size === returned page size  <  parent set size pagination`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions,
								requestedPageSize: messages.length,
								returnedPage: messages,
								parentSet: { messages: evenSizeReturnPage, pagination: {} },
							}),
						).to.eql({});
					});
					it(`returned page size < parent set size < requested page size pagination`, () => {
						expect(
							messageSetPagination({
								messagePaginationOptions,
								requestedPageSize: 1,
								returnedPage: messages,
								parentSet: { messages: evenSizeReturnPage, pagination: {} },
							}),
						).to.eql({ hasPrev: false, hasNext: false });
					});
				});
			});
		});
	});
});

describe('', () => {
	const messages = [
		{ created_at: '2024-08-05T08:55:00.199808Z', id: '0' },
		{ created_at: '2024-08-05T08:55:01.199808Z', id: '1' },
		{ created_at: '2024-08-05T08:55:02.199808Z', id: '2' },
		{ created_at: '2024-08-05T08:55:03.199808Z', id: '3' },
		{ created_at: '2024-08-05T08:55:04.199808Z', id: '4' },
		{ created_at: '2024-08-05T08:55:05.199808Z', id: '5' },
		{ created_at: '2024-08-05T08:55:06.199808Z', id: '6' },
		{ created_at: '2024-08-05T08:55:07.199808Z', id: '7' },
		{ created_at: '2024-08-05T08:55:08.199808Z', id: '8' },
	];
	it('finds the nearest newer item', () => {
		expect(binarySearchByDateEqualOrNearestGreater(messages, new Date('2024-08-05T08:55:02.299808Z'))).to.eql(3);
	});
	it('finds the nearest matching item', () => {
		expect(binarySearchByDateEqualOrNearestGreater(messages, new Date('2024-08-05T08:55:07.199808Z'))).to.eql(7);
	});
});
