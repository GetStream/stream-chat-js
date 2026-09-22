import type { StateStore } from '@stream-io/state-store';
import { ConfigController } from '../configuration/ConfigController';
import { deepFreezeConfig } from '../configuration/utils/deepFreezeConfig';
import { describePairedWrite } from './keys';
import type { PairedWrite } from './keys';

export type MutationEchoConfig = {
  /** `false` restores the previous behaviour: every paired write applies twice. */
  enabled: boolean;
  maxSize: number;
  ttlMs: number;
};

export const DEFAULT_MUTATION_ECHO_CONFIG: MutationEchoConfig = deepFreezeConfig({
  enabled: true,
  maxSize: 256,
  ttlMs: 10 * 1000,
});

/**
 * Remembers which server writes this client already applied, so the other half of the same round
 * trip — the HTTP response or its WS echo, whichever lands second — can skip re-applying it.
 *
 * Keys carry the server's `updated_at` (see `keys.ts`), so a stale entry can only ever suppress a
 * write that is byte-identical to one already applied. Everything here fails open: an unknown key,
 * an expired one, or a disabled ledger all mean "apply".
 *
 * In-memory projections only — the offline DB writes outside every gate and must stay that way.
 *
 * Internal; deliberately not exported from `src/index.ts`.
 */
export class MutationEcho {
  /** key -> recordedAt. Insertion-ordered, which is what makes eviction FIFO. */
  private entries = new Map<string, number>();

  /**
   * Entity id -> how many of this client's operations are open on it. A refcount rather than a
   * `Set` because an edit and a delete of the same message can overlap, and the first to settle
   * would otherwise clear the mark while the second is still in flight.
   */
  private openRequests = new Map<string, number>();

  private readonly configController: ConfigController<MutationEchoConfig>;

  constructor() {
    this.configController = new ConfigController<MutationEchoConfig>({
      defaults: DEFAULT_MUTATION_ECHO_CONFIG,
    });
  }

  get configState(): StateStore<MutationEchoConfig> {
    return this.configController.state;
  }

  get config(): Readonly<MutationEchoConfig> {
    return this.configState.getLatestValue();
  }

  updateConfig(config: Partial<MutationEchoConfig>) {
    this.configController.patch(config);
  }

  initializeConfig(config?: Partial<MutationEchoConfig>) {
    this.configController.initialize(config);
  }

  /** Diagnostics and tests, not API. */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Marks an operation open on `entityId` and returns its disposer. Only ever gates ARMING, so a
   * lost mark costs a redundant re-render rather than a lost update.
   */
  trackRequest(entityId: string | undefined): () => void {
    if (!entityId || !this.config.enabled) return () => undefined;

    this.openRequests.set(entityId, (this.openRequests.get(entityId) ?? 0) + 1);

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const open = this.openRequests.get(entityId);
      if (open === undefined) return;
      if (open <= 1) this.openRequests.delete(entityId);
      else this.openRequests.set(entityId, open - 1);
    };
  }

  /**
   * Runs `perform` unless this exact version was already applied, then records that it was — but
   * only when this client has the matching request open, since an event about someone else's write
   * has no twin to suppress.
   *
   * `write` may be `undefined` ("not a paired event"), in which case `perform` simply runs.
   *
   * Callers must not route a write here when it would change what a collection HOLDS rather than
   * only what it shows — a key cannot express membership. See `ingestChangesMembership`.
   */
  applyOnce(write: PairedWrite | undefined, perform: () => void) {
    if (!write) return perform();
    const { key, requestId } = describePairedWrite(write);
    if (this.wasApplied(key)) return;
    perform();
    if (this.hasOpenRequest(requestId)) this.recordApplied(key);
  }

  hasOpenRequest(entityId: string | undefined): boolean {
    if (!entityId || !this.config.enabled) return false;
    return this.openRequests.has(entityId);
  }

  /** Diagnostics and tests, not API. */
  get openRequestCount(): number {
    return this.openRequests.size;
  }

  private pruneExpired() {
    const now = Date.now();
    const { ttlMs } = this.config;

    for (const [key, recordedAt] of this.entries) {
      // Insertion-ordered and one shared TTL, so the first live entry ends the sweep.
      if (now - recordedAt <= ttlMs) break;
      this.entries.delete(key);
    }
  }

  /** Call AFTER the write, inside the branch that performed it. */
  recordApplied(key: string | undefined) {
    if (!key || !this.config.enabled) return;

    this.pruneExpired();

    // Re-recording restarts the TTL and moves the key to the back of the eviction order.
    this.entries.delete(key);

    if (this.entries.size >= this.config.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) this.entries.delete(oldestKey);
    }

    this.entries.set(key, Date.now());
  }

  /**
   * Non-consuming: one event can drive writes at several gated sites (a `show_in_channel` reply is
   * handled by both the channel and the thread), so consuming on match would make the first caller
   * skip and the second apply.
   */
  wasApplied(key: string | undefined): boolean {
    if (!key || !this.config.enabled) return false;

    const recordedAt = this.entries.get(key);
    if (recordedAt === undefined) return false;

    if (Date.now() - recordedAt > this.config.ttlMs) {
      this.entries.delete(key);
      return false;
    }

    return true;
  }

  /** Called on `disconnectUser` and on connection recovery, which re-queries everything. */
  clear() {
    this.entries.clear();
    this.openRequests.clear();
  }
}
