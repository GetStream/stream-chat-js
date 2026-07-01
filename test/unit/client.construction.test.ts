import axios from 'axios';
import https from 'https';
import sinon from 'sinon';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClientState } from '../../src/client_state';
import { FixedSizeQueueCache } from '../../src/utils/FixedSizeQueueCache';
import { InsightMetrics } from '../../src/insights';
import { MessageDeliveryReporter } from '../../src/messageDelivery';
import { Moderation } from '../../src/moderation';
import { NotificationManager } from '../../src/notifications';
import { PollManager } from '../../src/poll_manager';
import { ReminderManager } from '../../src/reminders';
import { StateStore } from '../../src/store';
import { StreamChat } from '../../src/client';
import { ThreadManager } from '../../src/thread_manager';
import { TokenManager } from '../../src/token_manager';
import { UploadManager } from '../../src/uploadManager';
import { axiosParamsSerializer } from '../../src/utils';

const API_KEY = 'apiKey';

const snapshotLocalTestEnv = () => {
  const run = process.env.STREAM_LOCAL_TEST_RUN;
  const host = process.env.STREAM_LOCAL_TEST_HOST;
  delete process.env.STREAM_LOCAL_TEST_RUN;
  delete process.env.STREAM_LOCAL_TEST_HOST;
  return () => {
    if (typeof run === 'undefined') delete process.env.STREAM_LOCAL_TEST_RUN;
    else process.env.STREAM_LOCAL_TEST_RUN = run;
    if (typeof host === 'undefined') delete process.env.STREAM_LOCAL_TEST_HOST;
    else process.env.STREAM_LOCAL_TEST_HOST = host;
  };
};

describe('StreamChat construction', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    delete (StreamChat as unknown as { _instance?: StreamChat })._instance;
    restoreEnv = snapshotLocalTestEnv();
  });

  afterEach(() => {
    sinon.restore();
    restoreEnv();
  });

  describe('signature', () => {
    it('accepts just a key', () => {
      const client = new StreamChat(API_KEY);
      expect(client.key).to.equal(API_KEY);
      expect(client.axiosInstance.defaults.timeout).to.equal(3000);
    });

    it('accepts (key, options)', () => {
      const client = new StreamChat(API_KEY, {
        axiosRequestConfig: { timeout: 5000 },
      });
      expect(client.key).to.equal(API_KEY);
      expect(client.axiosInstance.defaults.timeout).to.equal(5000);
    });

    it('treats an omitted options argument as an empty options object', () => {
      const client = new StreamChat(API_KEY);
      expect(client.options.warmUp).to.equal(false);
      expect(client.options.recoverStateOnReconnect).to.equal(true);
      expect(client.options.disableCache).to.equal(false);
    });
  });

  describe('initial instance state', () => {
    it('initializes empty collections and null connection refs', () => {
      const client = new StreamChat(API_KEY);

      expect(client.listeners).to.be.instanceOf(Map);
      expect(client.listeners.size).to.equal(0);
      expect(client.mutedChannels).to.deep.equal([]);
      expect(client.mutedUsers).to.deep.equal([]);
      expect(client.activeChannels).to.deep.equal({});
      expect(client.configs).to.deep.equal({});

      expect(client.wsConnection).to.be.null;
      expect(client.wsPromise).to.be.null;
      expect(client.setUserPromise).to.be.null;

      expect(client.anonymous).to.equal(false);
      expect(client.defaultWSTimeoutWithFallback).to.equal(6000);
      expect(client.defaultWSTimeout).to.equal(15000);
    });

    it('initializes blockedUsers as a StateStore with empty userIds', () => {
      const client = new StreamChat(API_KEY);
      expect(client.blockedUsers).to.be.instanceOf(StateStore);
      expect(client.blockedUsers.getLatestValue()).to.deep.equal({ userIds: [] });
    });

    it('does not share mutable state between instances', () => {
      const a = new StreamChat(API_KEY);
      const b = new StreamChat(API_KEY);

      expect(a.listeners).to.not.equal(b.listeners);
      expect(a.mutedChannels).to.not.equal(b.mutedChannels);
      expect(a.mutedUsers).to.not.equal(b.mutedUsers);
      expect(a.activeChannels).to.not.equal(b.activeChannels);
      expect(a.configs).to.not.equal(b.configs);
      expect(a.blockedUsers).to.not.equal(b.blockedUsers);
      expect(a.options).to.not.equal(b.options);
      expect(a.axiosInstance).to.not.equal(b.axiosInstance);
    });
  });

  describe('options resolution', () => {
    it('applies defaults when no options are passed', () => {
      const client = new StreamChat(API_KEY);

      expect(client.options.warmUp).to.equal(false);
      expect(client.options.recoverStateOnReconnect).to.equal(true);
      expect(client.options.disableCache).to.equal(false);
      expect(client.options.wsUrlParams).to.be.instanceOf(URLSearchParams);
      expect(client.recoverStateOnReconnect).to.equal(true);
    });

    it('honors user-provided overrides', () => {
      const client = new StreamChat(API_KEY, {
        warmUp: true,
        disableCache: true,
        recoverStateOnReconnect: false,
      });

      expect(client.options.warmUp).to.equal(true);
      expect(client.options.disableCache).to.equal(true);
      expect(client.options.recoverStateOnReconnect).to.equal(false);
      expect(client.recoverStateOnReconnect).to.equal(false);
    });

    it('passes persistUserOnConnectionFailure through to the client', () => {
      const defaultClient = new StreamChat(API_KEY);
      expect(defaultClient.persistUserOnConnectionFailure).to.be.undefined;

      const customClient = new StreamChat(API_KEY, {
        persistUserOnConnectionFailure: true,
      });
      expect(customClient.persistUserOnConnectionFailure).to.equal(true);
    });
  });

  describe('axios instantiation', () => {
    let createSpy: sinon.SinonSpy<
      Parameters<typeof axios.create>,
      ReturnType<typeof axios.create>
    >;

    beforeEach(() => {
      createSpy = sinon.spy(axios, 'create');
    });

    it('invokes axios.create exactly once and stores the result on axiosInstance', () => {
      const client = new StreamChat(API_KEY);
      expect(createSpy.calledOnce).to.be.true;
      expect(client.axiosInstance).to.equal(createSpy.firstCall.returnValue);
    });

    it('passes baked-in defaults (timeout, withCredentials, paramsSerializer) into axios.create', () => {
      new StreamChat(API_KEY, { browser: true });
      const config = createSpy.firstCall.args[0]!;
      expect(config.timeout).to.equal(3000);
      expect(config.withCredentials).to.equal(false);
      expect(config.paramsSerializer).to.equal(axiosParamsSerializer);
    });

    it('bakes defaults into the axios instance defaults', () => {
      const client = new StreamChat(API_KEY);
      expect(client.axiosInstance.defaults.timeout).to.equal(3000);
      expect(client.axiosInstance.defaults.withCredentials).to.equal(false);
      expect(client.axiosInstance.defaults.paramsSerializer).to.equal(
        axiosParamsSerializer,
      );
    });

    it('spreads axiosRequestConfig values into the axios.create config', () => {
      const axiosRequestConfig = {
        timeout: 9999,
        withCredentials: true,
        headers: { 'Cache-Control': 'no-cache' },
      };
      const client = new StreamChat(API_KEY, { axiosRequestConfig });
      expect(client.axiosInstance.defaults.timeout).to.equal(9999);
      expect(client.axiosInstance.defaults.withCredentials).to.equal(true);
      expect(client.axiosInstance.defaults.headers).to.include({
        'Cache-Control': 'no-cache',
      });
    });

    it('keeps paramsSerializer fixed even when axiosRequestConfig tries to override it', () => {
      const customSerializer = () => 'overridden';
      const client = new StreamChat(API_KEY, {
        axiosRequestConfig: { paramsSerializer: customSerializer },
      });
      expect(client.axiosInstance.defaults.paramsSerializer).to.equal(
        axiosParamsSerializer,
      );
      expect(client.axiosInstance.defaults.paramsSerializer).to.not.equal(
        customSerializer,
      );
    });

    it('preserves axiosRequestConfig on the client options', () => {
      const axiosRequestConfig = { headers: { 'Cache-Control': 'no-cache' } };
      const client = new StreamChat(API_KEY, { axiosRequestConfig });
      expect(client.options.axiosRequestConfig).to.equal(axiosRequestConfig);
    });

    it('produces a paramsSerializer that matches axiosParamsSerializer behavior', () => {
      const client = new StreamChat(API_KEY);
      const serializer = client.axiosInstance.defaults.paramsSerializer as (
        params: Record<string, unknown>,
      ) => string;
      const sample = { a: 1, b: [2, 3], skip: undefined };
      expect(serializer(sample)).to.equal(axiosParamsSerializer!(sample));
    });

    describe('httpsAgent', () => {
      it('auto-creates a keep-alive https.Agent in node mode', () => {
        const client = new StreamChat(API_KEY, { browser: false });
        const httpsAgent = client.axiosInstance.defaults.httpsAgent as https.Agent;
        expect(httpsAgent).to.be.instanceOf(https.Agent);
        expect(httpsAgent.keepAlive).to.equal(true);
      });

      it('lets axiosRequestConfig.httpsAgent override the auto-created agent', () => {
        const customAgent = new https.Agent({ keepAlive: false });
        const client = new StreamChat(API_KEY, {
          browser: false,
          axiosRequestConfig: { httpsAgent: customAgent },
        });
        expect(client.axiosInstance.defaults.httpsAgent).to.equal(customAgent);
      });

      it('does not auto-create an httpsAgent in browser mode', () => {
        const client = new StreamChat(API_KEY, { browser: true });
        expect(client.axiosInstance.defaults.httpsAgent).to.be.undefined;
      });
    });
  });

  describe('baseURL resolution', () => {
    let setBaseURLSpy: sinon.SinonSpy<[string], void>;

    beforeEach(() => {
      setBaseURLSpy = sinon.spy(StreamChat.prototype, 'setBaseURL');
    });

    it('defaults to the production baseURL with a wss WebSocket URL', () => {
      const client = new StreamChat(API_KEY);
      expect(client.baseURL).to.equal('https://chat.stream-io-api.com');
      expect(client.wsBaseURL).to.equal('wss://chat.stream-io-api.com');
      expect(setBaseURLSpy.calledOnce).to.be.true;
      expect(setBaseURLSpy.firstCall.args[0]).to.equal('https://chat.stream-io-api.com');
    });

    it('uses a custom baseURL when provided', () => {
      const client = new StreamChat(API_KEY, { baseURL: 'http://example.com:3030' });
      expect(client.baseURL).to.equal('http://example.com:3030');
      // http -> ws, :3030 -> :8800
      expect(client.wsBaseURL).to.equal('ws://example.com:8800');
    });

    it('overrides the baseURL when STREAM_LOCAL_TEST_RUN is set', () => {
      process.env.STREAM_LOCAL_TEST_RUN = 'true';
      const client = new StreamChat(API_KEY);
      expect(client.baseURL).to.equal('http://localhost:3030');
      expect(client.wsBaseURL).to.equal('ws://localhost:8800');
      // default url + override
      expect(setBaseURLSpy.callCount).to.equal(2);
    });

    it('further overrides the baseURL when STREAM_LOCAL_TEST_HOST is set', () => {
      process.env.STREAM_LOCAL_TEST_HOST = 'mybox.test:3030';
      const client = new StreamChat(API_KEY);
      expect(client.baseURL).to.equal('http://mybox.test:3030');
      expect(client.wsBaseURL).to.equal('ws://mybox.test:8800');
      // default url + host override
      expect(setBaseURLSpy.callCount).to.equal(2);
    });

    it('lets STREAM_LOCAL_TEST_HOST win over STREAM_LOCAL_TEST_RUN', () => {
      process.env.STREAM_LOCAL_TEST_RUN = 'true';
      process.env.STREAM_LOCAL_TEST_HOST = 'mybox.test:3030';
      const client = new StreamChat(API_KEY);
      expect(client.baseURL).to.equal('http://mybox.test:3030');
      expect(setBaseURLSpy.callCount).to.equal(3);
    });
  });

  describe('platform detection', () => {
    it('auto-detects platform based on the global window', () => {
      const client = new StreamChat(API_KEY);
      const expectedBrowser = typeof window !== 'undefined';
      expect(client.browser).to.equal(expectedBrowser);
      expect(client.node).to.equal(!expectedBrowser);
    });

    it('honors an explicit browser:true override', () => {
      const client = new StreamChat(API_KEY, { browser: true });
      expect(client.browser).to.equal(true);
      expect(client.node).to.equal(false);
    });

    it('honors an explicit browser:false override', () => {
      const client = new StreamChat(API_KEY, { browser: false });
      expect(client.browser).to.equal(false);
      expect(client.node).to.equal(true);
    });
  });

  describe('subsystem managers', () => {
    it('constructs the canonical set of managers', () => {
      const client = new StreamChat(API_KEY);

      expect(client.state).to.be.instanceOf(ClientState);
      expect(client.notifications).to.be.instanceOf(NotificationManager);
      expect(client.uploadManager).to.be.instanceOf(UploadManager);
      expect(client.moderation).to.be.instanceOf(Moderation);
      expect(client.tokenManager).to.be.instanceOf(TokenManager);
      expect(client.threads).to.be.instanceOf(ThreadManager);
      expect(client.polls).to.be.instanceOf(PollManager);
      expect(client.reminders).to.be.instanceOf(ReminderManager);
      expect(client.messageDeliveryReporter).to.be.instanceOf(MessageDeliveryReporter);
      expect(client.messageComposerCache).to.be.instanceOf(FixedSizeQueueCache);
      expect(client.insightMetrics).to.be.instanceOf(InsightMetrics);
    });

    it('reuses an externally supplied NotificationManager instead of wrapping it', () => {
      const notifications = new NotificationManager();
      const client = new StreamChat(API_KEY, { notifications });
      expect(client.notifications).to.equal(notifications);
    });

    it('constructs the TokenManager with no preloaded secret', () => {
      const client = new StreamChat(API_KEY);
      expect(client.tokenManager.secret).to.be.undefined;
    });

    it('caps the message composer cache at 64 entries', () => {
      const client = new StreamChat(API_KEY);
      for (let i = 0; i < 64; i++) {
        client.messageComposerCache.add(`k-${i}`, { i } as never);
      }
      expect(client.messageComposerCache.peek('k-0')).to.not.be.undefined;

      client.messageComposerCache.add('k-64', { i: 64 } as never);

      expect(client.messageComposerCache.peek('k-0')).to.be.undefined;
      expect(client.messageComposerCache.peek('k-64')).to.deep.equal({ i: 64 });
    });

    it('builds fresh manager instances per client', () => {
      const a = new StreamChat(API_KEY);
      const b = new StreamChat(API_KEY);
      expect(a.threads).to.not.equal(b.threads);
      expect(a.polls).to.not.equal(b.polls);
      expect(a.reminders).to.not.equal(b.reminders);
      expect(a.tokenManager).to.not.equal(b.tokenManager);
      expect(a.moderation).to.not.equal(b.moderation);
      expect(a.uploadManager).to.not.equal(b.uploadManager);
      expect(a.messageDeliveryReporter).to.not.equal(b.messageDeliveryReporter);
      expect(a.messageComposerCache).to.not.equal(b.messageComposerCache);
      expect(a.insightMetrics).to.not.equal(b.insightMetrics);
      expect(a.notifications).to.not.equal(b.notifications);
      expect(a.state).to.not.equal(b.state);
    });
  });

  describe('getInstance', () => {
    it('returns the same instance for repeated calls', () => {
      const a = StreamChat.getInstance(API_KEY);
      const b = StreamChat.getInstance(API_KEY);
      expect(a).to.equal(b);
    });

    it('caches the instance on the static _instance slot', () => {
      const instance = StreamChat.getInstance(API_KEY);
      expect((StreamChat as unknown as { _instance: StreamChat })._instance).to.equal(
        instance,
      );
    });

    it('ignores subsequent key and options after the first call', () => {
      const first = StreamChat.getInstance(API_KEY, {
        axiosRequestConfig: { timeout: 1111 },
      });
      const second = StreamChat.getInstance('different-key', {
        axiosRequestConfig: { timeout: 9999 },
      });

      expect(second).to.equal(first);
      expect(first.key).to.equal(API_KEY);
      expect(first.axiosInstance.defaults.timeout).to.equal(1111);
    });

    it('routes options through the constructor on first call', () => {
      const client = StreamChat.getInstance(API_KEY, {
        axiosRequestConfig: { timeout: 5000 },
      });
      expect(client.axiosInstance.defaults.timeout).to.equal(5000);
    });
  });
});
