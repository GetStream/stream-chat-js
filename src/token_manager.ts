import { chatLoggerSystem } from './logger';
import { UserFromToken } from './signing';
import { isFunction } from './utils';
import type { TokenOrProvider } from './types';

const logger = chatLoggerSystem.getLogger('token-manager');

export type TokenManagerMinimalUser = { id: string; anon?: boolean };
/** Holds the user token, either static or loaded from a provider. */
export class TokenManager {
  loadTokenPromise: Promise<string> | null;
  type: 'static' | 'provider';
  token?: string;
  tokenProvider?: TokenOrProvider;
  user?: TokenManagerMinimalUser;
  private _isAnonymous = false;
  constructor() {
    this.loadTokenPromise = null;

    this.type = 'static';
  }

  get isAnonymous() {
    return this._isAnonymous;
  }

  /**
   * Sets a static token or a provider (returns the token or a promise of it), then loads the token.
   * Throws when the token is not a string or function, or a string token does not match `user.id`.
   */
  setTokenOrProvider = async (
    tokenOrProvider: TokenOrProvider,
    user: TokenManagerMinimalUser,
  ) => {
    this.validateToken(tokenOrProvider, user);
    this.user = user;
    this._isAnonymous = !!user.anon;

    if (isFunction(tokenOrProvider)) {
      this.tokenProvider = tokenOrProvider;
      this.type = 'provider';
    }

    if (typeof tokenOrProvider === 'string') {
      this.token = tokenOrProvider;
      this.type = 'static';
    }

    await this.loadToken();
  };

  reset = () => {
    this._isAnonymous = false;
    this.token = undefined;
    this.tokenProvider = undefined;
    this.type = 'static';
    this.user = undefined;
    this.loadTokenPromise = null;
  };

  validateToken = (tokenOrProvider: TokenOrProvider, user: TokenManagerMinimalUser) => {
    // Anonymous users may have an empty token.
    if (user && user.anon && !tokenOrProvider) return;

    if (
      tokenOrProvider &&
      typeof tokenOrProvider !== 'string' &&
      !isFunction(tokenOrProvider)
    ) {
      throw new Error('user token should either be a string or a function');
    }

    if (typeof tokenOrProvider === 'string') {
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

  // The in-flight token load, for callers that must wait for it.
  tokenReady = () => this.loadTokenPromise;

  // Fetches the token from the provider and stores it. A static token resolves as is.
  loadToken = () => {
    // eslint-disable-next-line no-async-promise-executor
    this.loadTokenPromise = new Promise(async (resolve, reject) => {
      if (this.type === 'static') {
        return resolve(this.token as string);
      }

      if (this.tokenProvider && typeof this.tokenProvider !== 'string') {
        try {
          this.token = await this.tokenProvider();
        } catch (e) {
          logger
            .withExtraTags('loadToken')
            .error('The token provider threw an error.', { error: e });
          return reject(
            new Error(`Call to tokenProvider failed with message: ${e}`, { cause: e }),
          );
        }
        resolve(this.token);
      }
    });

    return this.loadTokenPromise;
  };

  getToken = () => {
    if (this.token) {
      return this.token;
    }

    if (this._isAnonymous) {
      return '';
    }

    throw new Error(
      `User token is not set. Either client.connectUser wasn't called or client.disconnectUser was called`,
    );
  };

  isStatic = () => this.type === 'static';
}
