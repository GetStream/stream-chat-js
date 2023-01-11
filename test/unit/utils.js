import chai from 'chai';
import { generateUUIDv4, normalizeQuerySort } from '../../src/utils';
import sinon from 'sinon';

const expect = chai.expect;

describe('generateUUIDv4', () => {
	beforeEach(() => {
		sinon.restore();
	});

	it('generates a UUID manually when crypto is unavailable', () => {
		sinon.spy(Math, 'pow');
		sinon.spy(Math, 'random');
		const uuid = generateUUIDv4();
		expect(uuid).to.be.a('string');
		expect(uuid.length).to.equal(36);
		expect(Math.pow.calledWithMatch(2, 8)).to.be.true;
		expect(Math.random.callCount).to.be.equal(16);
	});
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
