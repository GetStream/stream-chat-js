import { UserFromToken, JWTServerToken, JWTUserToken } from './signing';
import { isFunction } from './utils';

/**
 * TokenManager
 *
 * Handles all the operations around user token.
 */
export class TokenManager {
	/**
	 * Constructor
	 *
	 * @param {object} options
	 *
	 * Following options are available
	 *
	 * - tokenOrProvider {string | function}
	 *      It could either be a string token or a provider function that returns a promise (which resolves to token)
	 *      Provider function will be used to re-fetch the token, in case original token is expired.
	 * - user {object}
	 * - secret {string}
	 */
	constructor(options) {
		if (options && options.secret) {
			this.secret = options.secret;
		}
		this.type = 'static';

		if (this.secret) {
			this.token = JWTServerToken(this.secret);
		}
	}

	setTokenOrProvider = async (tokenOrProvider, user) => {
		this.validateToken(tokenOrProvider, user);
		this.user = user;

		if (isFunction(tokenOrProvider)) {
			this.tokenProvider = tokenOrProvider;
			this.type = 'provider';
		}

		if (typeof tokenOrProvider === 'string') {
			this.token = tokenOrProvider;
			this.type = 'static';
		}

		if (!tokenOrProvider && this.user && this.secret) {
			this.token = JWTUserToken(this.secret, user.id, {}, {});
			this.type = 'static';
		}

		await this.loadToken();
	};

	expire = () => {
		this.token = null;
		this.user = null;
	};

	// Validates the user token.
	validateToken = (tokenOrProvider, user) => {
		if (user && user.anon && tokenOrProvider === '') return;

		if (
			tokenOrProvider &&
			typeof tokenOrProvider !== 'string' &&
			!isFunction(tokenOrProvider)
		) {
			throw new Error('user token should either be a string or a function');
		}

		if (typeof tokenOrProvider === 'string') {
			// Allow empty token for anonymous users
			if (user.anon && tokenOrProvider === '') return;

			const tokenUserId = UserFromToken(tokenOrProvider);
			if (
				tokenOrProvider != null &&
				(tokenUserId == null || tokenUserId === '' || tokenUserId !== user.id)
			) {
				throw new Error(
					'userToken does not have a user_id or is not matching with user.id',
				);
			}
		}
	};

	loadToken = async () => {
		if (this.type === 'static') {
			return Promise.resolve();
		}

		this.token = await this.tokenProvider();

		return this.token;
	};

	getToken = () => {
		if (this.token) {
			return this.token;
		}

		if (this.user && this.user.anon && this.token === '') {
			return this.token;
		}

		if (this.secret) {
			return JWTServerToken(this.secret);
		}

		throw new Error(
			`Both secret and user tokens are not set. Either client.setUser wasn't called or client.disconnect was called`,
		);
	};

	isStatic = () => this.type === 'static';
}
