import { isErrorResponse, isErrorRetryable } from '../../src/errors';

import { describe, it, expect } from 'vitest';

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

describe('isErrorRetryable', () => {
	it('is false for a code it does not know and for a missing code', () => {
		expect(isErrorRetryable({ code: 4242 })).to.be.false;
		expect(isErrorRetryable({})).to.be.false;
	});
});
