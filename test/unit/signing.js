import { expect } from 'chai';
import { CheckSignature } from '../../src';

const MOCK_SECRET = 'porewqKAFDSAKZssecretsercretfads';
const MOCK_TEXT = 'text';
const MOCK_JSON_BODY = { a: 1 };
const MOCK_TEXT_SHA256 = 'd0b770e93a56adc3ee9ac5734533cc0acd71eea8e5e8204a28042ca0f60de1f3';
const MOCK_JSON_SHA256 = 'e527a6ad4993a4c9a30680c8be4b3eda1c36ab104f1f7d39c744bd27016a9624';

describe('Signing', () => {
	describe('CheckSignature', () => {
		it('validates correct text body and signature', () => {
			const rawBody = Buffer.from(MOCK_TEXT);
			expect(CheckSignature(rawBody, MOCK_SECRET, MOCK_TEXT_SHA256)).to.be.true;
		});

		it('validates correct json body and signature', () => {
			const rawBody = Buffer.from(JSON.stringify(MOCK_JSON_BODY));
			expect(CheckSignature(rawBody, MOCK_SECRET, MOCK_JSON_SHA256)).to.be.true;
		});

		it('refutes incorrect json body', () => {
			const rawBody = Buffer.from(JSON.stringify({ ...MOCK_JSON_BODY, b: 2 }));
			expect(CheckSignature(rawBody, MOCK_SECRET, MOCK_JSON_SHA256)).to.be.false;
		});
	});
});
