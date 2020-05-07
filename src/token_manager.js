import { UserFromToken, JWTServerToken } from './signing';
import { isFunction } from './utils';

export class TokenManager {
	constructor({ tokenOrProvider, user, secret }) {
		this.secret = secret;
		this.user = user;

		if (tokenOrProvider == null && this.secret === null) {
			throw new Error('both userToken and api secret are not provided');
		}

		if (tokenOrProvider == null && this.secret != null) {
			this.token = this.createToken(this.userID);
		} else if (isFunction(tokenOrProvider)) {
			this.tokenProvider = tokenOrProvider;
			this.type = 'provider';
		} else if (typeof tokenOrProvider === 'string') {
			this.token = tokenOrProvider;
			this.type = 'static';

			const tokenUserId = UserFromToken(this.token);
			if (
				this.token != null &&
				(tokenUserId == null || tokenUserId === '' || tokenUserId !== user.id)
			) {
				throw new Error(
					'userToken does not have a user_id or is not matching with user.id',
				);
			}
		} else {
			throw new Error('user token is invalid');
		}
	}

	loadToken = async () => {
		if (this.type === 'static') {
			return Promise.resolve();
		}

		this.token = await this.tokenProvider();
	};

	getToken = () => {
		if (this.secret == null && this.token == null) {
			throw new Error(
				`Both secret and user tokens are not set. Either client.setUser wasn't called or client.disconnect was called`,
			);
		}

		if (this.token !== null) {
			return this.token;
		}

		return JWTServerToken(this.secret);
	};

	isStatic = () => this.type === 'static';
}
