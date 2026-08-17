import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateChannel } from '../test-utils/generateChannel';
import { getClientWithUser } from '../test-utils/getClient';
import { generateMsg } from '../test-utils/generateMessage';
import { generateThreadResponse } from '../test-utils/generateThreadResponse';
import { Thread } from '../../../src/thread';
import type { StreamChat } from '../../../src/client';

/**
 * A configuration publish allocates a fresh object every time, so `StateStore.next`'s `===` no-op can never
 * apply to one. Without a comparison somewhere, every publish notifies whether or not a value moved — and in
 * the React SDK that is a re-render for any consumer whose selector returns part of the config rather than a
 * scalar.
 *
 * The dominant source was a repeated channel query. The API returns a **fresh** config object for the same
 * channel type on each response, so `_addChannelConfig` replaced the stored one, the by-type selector in
 * `MessageComposer.subscribeChannelConfigChanged` fired, and every live composer re-resolved. Measured on a
 * 10-channel page with three open composers: **30 publishes and 30 subscriber runs, down to 3** — one per
 * composer, for the config genuinely arriving the first time.
 *
 * The guards below sit at three points, because each covers a route the others cannot:
 *
 * - **the source** — `_addChannelConfig` ignores a server config deep-equal to the stored one, so the work
 *   never happens;
 * - **the sink** — `MessageComposer.publishConfig` skips a resolution equal to what is published;
 * - **the derivation** — `Channel` / `Thread` `initializeConfig` skip a `requestHandlers` value that has
 *   not moved, which matters because both re-run on any `alsoWatch` key.
 *
 * A fourth now sits inside `ConfigController` and covers every entity that resolves through it; that one is
 * unit-tested in `ConfigController.test.ts`. The three here are the end-to-end checks, and they are what
 * would catch a regression that the controller's own guard cannot see.
 */
describe('configuration publishes skip no-ops', () => {
  let client: StreamChat;
  let channelResponse: ReturnType<typeof generateChannel>['channel'];
  const serverConfig = { max_message_length: 5000, shared_locations: true };

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
    channelResponse = generateChannel().channel;
  });

  describe('at the source — client._addChannelConfig', () => {
    it('ignores a config deep-equal to the one already stored', () => {
      client._addChannelConfig({
        type: 'messaging',
        config: { ...serverConfig } as never,
      });
      const first = client.channelConfigsByType['messaging'];

      client._addChannelConfig({
        type: 'messaging',
        config: { ...serverConfig } as never,
      });

      // Same object kept, so the store never published and nothing downstream woke up.
      expect(client.channelConfigsByType['messaging']).toBe(first);
    });

    it('does not notify the store for a repeated identical config', () => {
      client._addChannelConfig({
        type: 'messaging',
        config: { ...serverConfig } as never,
      });
      const listener = vi.fn();
      client.channelConfigsByTypeStore.subscribe(listener);
      listener.mockClear();

      for (let i = 0; i < 10; i++) {
        client._addChannelConfig({
          type: 'messaging',
          config: { ...serverConfig } as never,
        });
      }

      expect(listener).not.toHaveBeenCalled();
    });

    it('still stores a config that genuinely changed', () => {
      client._addChannelConfig({
        type: 'messaging',
        config: { ...serverConfig } as never,
      });

      client._addChannelConfig({
        type: 'messaging',
        config: { ...serverConfig, max_message_length: 120 } as never,
      });

      expect(client.channelConfigsByType['messaging']).toMatchObject({
        max_message_length: 120,
      });
    });

    it('keeps a repeated channel query from waking live composers', () => {
      const composers = ['a', 'b', 'c'].map((id) => {
        const composer = client.channel('messaging', id).messageComposer;
        composer.registerSubscriptions();
        return composer;
      });
      // The config arrives for the first time: every composer should hear about this one.
      client._addChannelConfig({
        type: 'messaging',
        config: { ...serverConfig } as never,
      });

      let publishes = 0;
      composers.forEach((composer) => composer.configState.subscribe(() => publishes++));
      publishes = 0;

      for (let i = 0; i < 10; i++) {
        client._addChannelConfig({
          type: 'messaging',
          config: { ...serverConfig } as never,
        });
      }

      expect(publishes).toBe(0);
    });

    it('skips the re-resolution itself, not just the notification', () => {
      // What the source guard buys over the sink guard, which would suppress the notification but only after
      // every composer had resolved its configuration and thrown the result away. Removing the sink guard
      // leaves this passing; removing the source guard is what turns it red.
      const composer = client.channel('messaging', channelResponse.id).messageComposer;
      composer.registerSubscriptions();
      client._addChannelConfig({
        type: 'messaging',
        config: { ...serverConfig } as never,
      });

      const reResolve = vi.spyOn(composer, 'applyServerRestrictions');

      for (let i = 0; i < 10; i++) {
        client._addChannelConfig({
          type: 'messaging',
          config: { ...serverConfig } as never,
        });
      }

      expect(reResolve).not.toHaveBeenCalled();
    });

    it('does wake them when the server config actually changes', () => {
      const composer = client.channel('messaging', channelResponse.id).messageComposer;
      composer.registerSubscriptions();
      client._addChannelConfig({
        type: 'messaging',
        config: { ...serverConfig } as never,
      });
      expect(composer.config.text.maxLengthOnSend).toBe(5000);

      client._addChannelConfig({
        type: 'messaging',
        config: { ...serverConfig, max_message_length: 120 } as never,
      });

      expect(composer.config.text.maxLengthOnSend).toBe(120);
    });
  });

  describe('at the sink — MessageComposer.publishConfig', () => {
    it('does not notify when a declarative re-registration changes nothing', () => {
      const composer = client.channel('messaging', channelResponse.id).messageComposer;
      composer.registerSubscriptions();
      client.config.set({ messageComposer: { drafts: { enabled: true } } });

      const listener = vi.fn();
      composer.configState.subscribe(listener);
      listener.mockClear();

      // Same value again — the registry publishes, the composer re-resolves, the result is identical.
      client.config.set({ messageComposer: { drafts: { enabled: true } } });

      expect(listener).not.toHaveBeenCalled();
    });

    it('does not notify for an empty updateConfig', () => {
      const composer = client.channel('messaging', channelResponse.id).messageComposer;
      const listener = vi.fn();
      composer.configState.subscribe(listener);
      listener.mockClear();

      composer.updateConfig({});

      expect(listener).not.toHaveBeenCalled();
    });

    it('still notifies for a real change', () => {
      const composer = client.channel('messaging', channelResponse.id).messageComposer;
      const listener = vi.fn();
      composer.configState.subscribe(listener);
      listener.mockClear();

      composer.updateConfig({ drafts: { enabled: true } });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(composer.config.drafts.enabled).toBe(true);
    });

    it('still notifies when a server restriction lifts a value it had narrowed', () => {
      // The guard must compare the *resolved* value, not the request — otherwise a restriction changing
      // while the request stays put would be silently swallowed.
      client._addChannelConfig({
        type: 'messaging',
        config: { shared_locations: false } as never,
      });
      const composer = client.channel('messaging', channelResponse.id).messageComposer;
      composer.registerSubscriptions();
      composer.updateConfig({ location: { enabled: true } });
      expect(composer.config.location.enabled).toBe(false);

      const listener = vi.fn();
      composer.configState.subscribe(listener);
      listener.mockClear();

      client._addChannelConfig({
        type: 'messaging',
        config: { shared_locations: true } as never,
      });

      expect(listener).toHaveBeenCalled();
      expect(composer.config.location.enabled).toBe(true);
    });
  });
  /**
   * `Channel.initializeConfig` and `Thread.initializeConfig` are derivations: they *replace*
   * `configState.requestHandlers` rather than merging, and they build a fresh object every time, so
   * `StateStore.next`'s `===` no-op can never apply. Every re-derivation therefore woke every subscriber
   * with an identical value.
   *
   * They also run far more often than the `channel` / `thread` key changes: both register
   * `alsoWatch: ['messagePaginator', 'messageOperations']`, so a registration against either shared key
   * re-runs the whole cycle for every live channel and thread. The React SDK's request-handler
   * coordinator subscribes to both stores, so those wake-ups reach components.
   */
  describe('at the derivation — Channel / Thread initializeConfig', () => {
    it('does not notify a channel whose derived requestHandlers have not moved', () => {
      const channel = client.channel('messaging', channelResponse.id);
      const listener = vi.fn();
      channel.configState.subscribe(listener);
      listener.mockClear();

      // An `alsoWatch` key, so this re-runs the full `channel` cycle without touching its slice.
      client.config.setConfig('messagePaginator', { pageSize: 30 });
      client.config.setConfig('messageOperations', { failedSendCacheMaxSize: 7 });

      expect(listener).not.toHaveBeenCalled();
    });

    it('still notifies when a handler is registered', () => {
      const channel = client.channel('messaging', channelResponse.id);
      const listener = vi.fn();
      channel.configState.subscribe(listener);
      listener.mockClear();

      const sendMessageRequest = () => undefined;
      client.config.setConfig('channel', {
        requestHandlers: { sendMessageRequest },
      } as never);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(
        channel.configState.getLatestValue().requestHandlers?.sendMessageRequest,
      ).toBe(sendMessageRequest);
    });

    it('still notifies when a handler is dropped from the tree', () => {
      const sendMessageRequest = () => undefined;
      client.config.setConfig('channel', {
        requestHandlers: { sendMessageRequest },
      } as never);
      const channel = client.channel('messaging', channelResponse.id);
      expect(channel.configState.getLatestValue().requestHandlers).toBeDefined();

      const listener = vi.fn();
      channel.configState.subscribe(listener);
      listener.mockClear();

      // A derivation, so clearing the registration has to remove the handler.
      client.config.reset('channel');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(channel.configState.getLatestValue().requestHandlers).toBeUndefined();
    });

    it('does not notify a thread whose derived requestHandlers have not moved', () => {
      const thread = new Thread({
        client,
        threadData: generateThreadResponse(channelResponse, generateMsg()),
      });
      thread.registerSubscriptions();

      const listener = vi.fn();
      thread.configState.subscribe(listener);
      listener.mockClear();

      client.config.setConfig('messagePaginator', { pageSize: 30 });

      expect(listener).not.toHaveBeenCalled();
    });

    it('still notifies a thread when its handler is registered', () => {
      const thread = new Thread({
        client,
        threadData: generateThreadResponse(channelResponse, generateMsg()),
      });
      thread.registerSubscriptions();

      const listener = vi.fn();
      thread.configState.subscribe(listener);
      listener.mockClear();

      const markReadRequest = () => undefined;
      client.config.setConfig('thread', {
        requestHandlers: { markReadRequest },
      } as never);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(thread.configState.getLatestValue().requestHandlers?.markReadRequest).toBe(
        markReadRequest,
      );
    });
  });
});
