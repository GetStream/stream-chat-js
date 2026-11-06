import { DevToken, StreamChat, UserFromToken } from '../../src';

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

	describe('DevToken', () => {
		it('builds the same unsigned token as v9', () => {
			expect(DevToken('amin')).to.equal(
				'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiYW1pbiJ9.devtoken',
			);
		});

		it('round-trips through UserFromToken, including non-Latin-1 ids', () => {
			expect(UserFromToken(DevToken('amin'))).to.equal('amin');
			expect(() => DevToken('ünicode-✓')).not.to.throw();
		});

		it('is exposed as client.devToken', () => {
			const client = new StreamChat('key');
			expect(client.devToken('amin')).to.equal(DevToken('amin'));
		});
	});
});
