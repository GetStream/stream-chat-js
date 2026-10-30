import { isEphemeral, isErrorResponse, parseError } from '../../src/errors';
import { OfflineError } from '../../src/offline-support/types';

import { AxiosError, CanceledError } from 'axios';
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

describe('isEphemeral', () => {
	it('is true when the server never responded', () => {
		expect(isEphemeral(new Error('network down'))).to.be.true;
	});
	it('is true for a retryable server code', () => {
		expect(isEphemeral({ code: 9, response: {} })).to.be.true; // RateLimitError
	});
	it('is false for a non-retryable server code', () => {
		expect(isEphemeral({ code: 4, response: {} })).to.be.false; // InputError
	});
	// A cancelled request carries no `response`, so the no-response branch alone would call it
	// ephemeral. It must not be: aborting is a caller decision, and treating it as transient would
	// queue the request for replay and keep any optimistic local update.
	it('is false for a cancelled request, despite it having no response', () => {
		const canceled = new CanceledError('canceled');
		expect(canceled.response).to.be.undefined;
		expect(isEphemeral(canceled)).to.be.false;
	});
});

describe('parseError', () => {
	// UI SDKs key "network failure" UI (edit / discard a failed message) on `status === 0`.
	it('gives a request that got no response status 0', () => {
		const networkError = new AxiosError('Network Error', 'ERR_NETWORK');
		expect(parseError(networkError).status).to.equal(0);
	});
	it('gives a request the offline layer refused to send status 0', () => {
		const offline = new OfflineError('offline', { type: 'connection:lost' });
		expect(parseError(offline).status).to.equal(0);
	});
	// A custom request handler's own error is a rejection, not a transport failure.
	it('leaves the status unset for an error that did not come from a request', () => {
		expect(parseError(new Error('invalid message')).status).to.be.undefined;
	});
	it('leaves the status unset for a request the caller cancelled', () => {
		expect(parseError(new CanceledError()).status).to.be.undefined;
	});
	it('keeps the HTTP status of a request that got a response', () => {
		const rejected = new AxiosError(
			'Request failed',
			'ERR_BAD_REQUEST',
			undefined,
			undefined,
			{
				data: { code: 4 },
				headers: {},
				status: 400,
			},
		);
		expect(parseError(rejected).status).to.equal(400);
	});
});
