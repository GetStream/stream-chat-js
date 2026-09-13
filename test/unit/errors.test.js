import { isErrorResponse } from '../../src/errors';
import {
  APIErrorCodes,
  isAPIError,
  isErrorRetryable,
  isConnectionIDError,
  isWSFailure,
  isErrorResponse as isErrorResponseFromIndex,
} from '../../src/index';

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
	it('exports error helpers from index entry point', () => {
		expect(APIErrorCodes).to.be.an('object');
		expect(isAPIError).to.be.a('function');
		expect(isErrorRetryable).to.be.a('function');
		expect(isConnectionIDError).to.be.a('function');
		expect(isWSFailure).to.be.a('function');
		expect(isErrorResponseFromIndex).to.equal(isErrorResponse);
	});
});

