import type { StreamClient } from '@stream-io/node-sdk';
import { hardDeleteUsers } from './users';
import {
  CHANNEL_TYPE_PROPAGATION_MS,
  isChannelTypeMissing,
  retry,
  retryOnRateLimit,
  waitForTask,
} from './wait';

/**
 * Collects everything a test file creates and removes it in `afterAll`.
 *
 * ```ts
 * const cleanup = new Cleanup(getServerClient());
 * cleanup.users.push(userId);
 * cleanup.add(() => serverClient.updateApp(originalSettings));
 * afterAll(() => cleanup.run());
 * ```
 *
 * Everything is attempted even if a step fails; failures are thrown together at the
 * end so leftovers (especially channel types, which count against an app limit) don't
 * pile up silently.
 */
export class Cleanup {
  users: string[] = [];
  /** Channel cids (`type:id`). */
  channels: string[] = [];
  channelTypes: string[] = [];
  private custom: Array<() => Promise<unknown>> = [];

  constructor(private serverClient: StreamClient) {}

  /** Extra cleanup steps (restore app settings, delete blocklists, ...). Run first, in reverse order. */
  add(fn: () => Promise<unknown>) {
    this.custom.push(fn);
  }

  async run() {
    const errors: unknown[] = [];
    const attempt = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (error) {
        errors.push(error);
      }
    };

    for (const fn of [...this.custom].reverse()) await attempt(fn);
    if (this.channels.length) await attempt(() => this.deleteChannels());
    // A channel type can only be deleted once all of its channels are gone.
    for (const type of this.channelTypes) {
      await attempt(() => this.deleteChannelType(type));
    }
    if (this.users.length) {
      await attempt(() => hardDeleteUsers(this.serverClient, this.users));
    }

    if (errors.length) {
      throw new AggregateError(errors, '[docs-snippets] cleanup failed, see `errors`');
    }
  }

  private async deleteChannelType(type: string) {
    // "channels of that type exist": the channel delete task hasn't caught up yet.
    // "does not exist": either already deleted (e.g. by the snippet) or, right after
    // creation, this API node doesn't know the type yet - keep trying for a while and
    // treat it as gone after that.
    const startedAt = Date.now();
    try {
      await retry(() => this.serverClient.chat.deleteChannelType({ name: type }), {
        timeout: 60000,
        interval: 2000,
        retryIf: (error) =>
          error instanceof Error &&
          (/channels of that type exist/.test(error.message) ||
            (isChannelTypeMissing(error) &&
              Date.now() - startedAt < CHANNEL_TYPE_PROPAGATION_MS + 5000)),
      });
    } catch (error) {
      if (!isChannelTypeMissing(error)) throw error;
    }
  }

  private async deleteChannels() {
    // Server-side hard delete runs as a background task: wait for it so the channel
    // types can be deleted afterwards.
    const response = await retryOnRateLimit(() =>
      this.serverClient.chat.deleteChannels({ cids: this.channels, hard_delete: true }),
    );
    if (response.task_id) await waitForTask(this.serverClient, response.task_id);
  }
}
