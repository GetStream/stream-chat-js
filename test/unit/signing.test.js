import { UserFromToken } from '../../src';

import { describe, expect, it } from 'vitest';

describe('Signing', () => {
	describe('UserFromToken', () => {
		it('extracts the user_id from a valid JWT payload', () => {
			// payload: {"user_id":"amin"}
			const token = '_.eyJ1c2VyX2lkIjoiYW1pbiJ9._';
			expect(UserFromToken(token)).to.equal('amin');
		});

		it('returns an empty string for a token that is not three fragments', () => {
			expect(UserFromToken('not-a-token')).to.equal('');
			expect(UserFromToken('only.two')).to.equal('');
			expect(UserFromToken('too.many.fragments.here')).to.equal('');
		});

		it('returns undefined when the payload has no user_id', () => {
			// payload: {"foo":"bar"}
			const token = 'eyJhbGciOiJIUzI1NiJ9.eyJmb28iOiJiYXIifQ.sig';
			expect(UserFromToken(token)).to.be.undefined;
		});
	});
});
