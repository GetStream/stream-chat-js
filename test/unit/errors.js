import chai from 'chai';
import { isErrorResponse } from '../../src/errors';

const expect = chai.expect;

describe('error response', () => {
	it('is response with no status attribute', () => {
		expect(isErrorResponse({})).to.be.true;
	});
	it('is response with status code other than 2xx', () => {
		expect(isErrorResponse({ status: 100 })).to.be.true;
		expect(isErrorResponse({ status: 300 })).to.be.true;
		expect(isErrorResponse({ status: 400 })).to.be.true;
		expect(isErrorResponse({ status: 500 })).to.be.true;
	});
	it('is not response with status code 2xx', () => {
		expect(isErrorResponse({ status: 200 })).to.be.false;
		expect(isErrorResponse({ status: 299 })).to.be.false;
	});
});
