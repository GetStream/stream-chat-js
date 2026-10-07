import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityStore } from '../../src/entityStore/EntityStore';
import type { EntityStoreSubscriber } from '../../src/entityStore/EntityStore';
import { formatMessage } from '../../src/utils';
import { generateMsg } from './test-utils/generateMessage';
import type { LocalMessage } from '../../src';

const msg = (overrides: Partial<Parameters<typeof generateMsg>[0]> = {}): LocalMessage =>
  formatMessage(generateMsg(overrides));

const getEntityId = (m: LocalMessage) => m.id;

const spySubscriber = (): EntityStoreSubscriber & {
  onEntitiesChanged: ReturnType<typeof vi.fn>;
} => ({
  onEntitiesChanged: vi.fn(),
});

describe('EntityStore', () => {
  let store: EntityStore<LocalMessage>;

  beforeEach(() => {
    store = new EntityStore<LocalMessage>({ getEntityId });
  });

  describe('reads / writes', () => {
    it('stores and reads a message by id', () => {
      const m = msg({ id: 'm1' });
      store.upsert(m);
      expect(store.get('m1')).toBe(m);
      expect(store.has('m1')).toBe(true);
    });

    it('returns undefined for missing / non-string ids', () => {
      expect(store.get('nope')).toBeUndefined();
      expect(store.get(undefined)).toBeUndefined();
      expect(store.has('nope')).toBe(false);
    });

    it('replaces the canonical copy on upsert (immutable)', () => {
      const first = msg({ id: 'm1', text: 'a' });
      const second = { ...first, text: 'b' };
      store.upsert(first);
      store.upsert(second);
      expect(store.get('m1')).toBe(second);
    });
  });

  describe('subscribe (atomic)', () => {
    it('fires immediately with current value, then on change, and stops after unsubscribe', () => {
      const handler = vi.fn();
      store.upsert(msg({ id: 'm1', text: 'a' }));

      const unsubscribe = store.subscribe('m1', handler);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'a' }));

      store.upsert(msg({ id: 'm1', text: 'b' }));
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'b' }));

      unsubscribe();
      store.upsert(msg({ id: 'm1', text: 'c' }));
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('fires immediately with undefined when the id is absent', () => {
      const handler = vi.fn();
      store.subscribe('ghost', handler);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenLastCalledWith(undefined);
    });
  });

  describe('link / unlink notification routing', () => {
    it('notifies only subscribers linked to the changed id', () => {
      const a = spySubscriber();
      const b = spySubscriber();
      store.link('m1', a);
      store.link('m2', b);

      store.upsert(msg({ id: 'm1' }));
      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
      expect(b.onEntitiesChanged).not.toHaveBeenCalled();

      const batch = a.onEntitiesChanged.mock.calls[0][0];
      expect([...batch.changedIds]).toEqual(['m1']);
    });

    it('skips the writing subscriber but notifies other subscribers', () => {
      const subscriber = spySubscriber();
      const sibling = spySubscriber();
      store.link('m1', subscriber);
      store.link('m1', sibling);

      store.upsert(msg({ id: 'm1' }), subscriber);
      expect(subscriber.onEntitiesChanged).not.toHaveBeenCalled();
      expect(sibling.onEntitiesChanged).toHaveBeenCalledTimes(1);
    });

    it('does not notify a subscriber after it unlinks', () => {
      const a = spySubscriber();
      store.link('m1', a);
      store.unlink('m1', a);
      store.upsert(msg({ id: 'm1' }));
      expect(a.onEntitiesChanged).not.toHaveBeenCalled();
    });
  });

  describe('refcount GC', () => {
    it('drops the canonical copy when the last subscriber unlinks', () => {
      const a = spySubscriber();
      store.upsert(msg({ id: 'm1' }));
      store.link('m1', a);

      store.unlink('m1', a);
      expect(store.has('m1')).toBe(false);
      expect(store.get('m1')).toBeUndefined();
    });

    it('keeps the message alive while another subscriber remains', () => {
      const a = spySubscriber();
      const b = spySubscriber();
      store.upsert(msg({ id: 'm1' }));
      store.link('m1', a);
      store.link('m1', b);

      store.unlink('m1', a);
      expect(store.has('m1')).toBe(true);

      store.unlink('m1', b);
      expect(store.has('m1')).toBe(false);
    });
  });

  describe('transaction batching', () => {
    it('coalesces multiple writes into one notification per subscriber', () => {
      const a = spySubscriber();
      store.link('m1', a);
      store.link('m2', a);
      store.link('m3', a);

      store.transaction(() => {
        store.upsert(msg({ id: 'm1' }));
        store.upsert(msg({ id: 'm2' }));
        store.upsert(msg({ id: 'm3' }));
      });

      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
      const batch = a.onEntitiesChanged.mock.calls[0][0];
      expect([...batch.changedIds].sort()).toEqual(['m1', 'm2', 'm3']);
    });

    it('flushes only when the outermost transaction exits', () => {
      const a = spySubscriber();
      store.link('m1', a);

      store.transaction(() => {
        store.transaction(() => {
          store.upsert(msg({ id: 'm1' }));
        });
        expect(a.onEntitiesChanged).not.toHaveBeenCalled();
      });
      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
    });

    it('does not notify a subscriber whose watched ids were untouched', () => {
      const a = spySubscriber();
      const b = spySubscriber();
      store.link('m1', a);
      store.link('m2', b);

      store.transaction(() => {
        store.upsert(msg({ id: 'm1' }));
      });

      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
      expect(b.onEntitiesChanged).not.toHaveBeenCalled();
    });
  });

  describe('flushSubscribers inside a transaction', () => {
    /**
     * A subscriber recording the ORDER in which it is called, which is the whole point: a
     * `flushState` that lands before `onEntitiesChanged` is a silent no-op, because the subscriber
     * has not been handed the change yet and so has nothing pending to flush.
     */
    const orderedSubscriber = (log: string[], name: string): EntityStoreSubscriber => ({
      onEntitiesChanged: () => log.push(`${name}:changed`),
      flushState: () => log.push(`${name}:flushed`),
    });

    it('defers the flush to the outermost exit, and runs it AFTER the change notification', () => {
      const log: string[] = [];
      store.link('m1', orderedSubscriber(log, 'sibling'));

      store.transaction(() => {
        store.upsert(msg({ id: 'm1' }));
        store.flushSubscribers('m1');
        // Nothing at all has reached the subscriber yet — that is what makes an inline flush here
        // useless.
        expect(log).toEqual([]);
      });

      expect(log).toEqual(['sibling:changed', 'sibling:flushed']);
    });

    it('is unchanged outside a transaction', () => {
      const log: string[] = [];
      store.link('m1', orderedSubscriber(log, 'sibling'));

      store.upsert(msg({ id: 'm1' }));
      store.flushSubscribers('m1');

      expect(log).toEqual(['sibling:changed', 'sibling:flushed']);
    });

    it('dedupes repeated requests for the same id and drains every distinct one', () => {
      const log: string[] = [];
      store.link('m1', orderedSubscriber(log, 'one'));
      store.link('m2', orderedSubscriber(log, 'two'));

      store.transaction(() => {
        store.upsert(msg({ id: 'm1' }));
        store.upsert(msg({ id: 'm2' }));
        store.flushSubscribers('m1');
        store.flushSubscribers('m1');
        store.flushSubscribers('m2');
      });

      expect(log.filter((entry) => entry.endsWith(':flushed'))).toEqual([
        'one:flushed',
        'two:flushed',
      ]);
    });

    it('drains only on the outermost exit of a nested transaction', () => {
      const log: string[] = [];
      store.link('m1', orderedSubscriber(log, 'sibling'));

      store.transaction(() => {
        store.transaction(() => {
          store.upsert(msg({ id: 'm1' }));
          store.flushSubscribers('m1');
        });
        expect(log).toEqual([]);
      });

      expect(log).toEqual(['sibling:changed', 'sibling:flushed']);
    });

    it('does not leak requested ids into a later transaction', () => {
      const log: string[] = [];
      store.link('m1', orderedSubscriber(log, 'sibling'));

      store.transaction(() => {
        store.upsert(msg({ id: 'm1' }));
        store.flushSubscribers('m1');
      });
      log.length = 0;

      store.transaction(() => {
        store.upsert(msg({ id: 'm1' }));
      });

      expect(log).toEqual(['sibling:changed']);
    });
  });

  describe('onRelease', () => {
    it('receives the entity when its last holder unlinks', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });
      const a = spySubscriber();
      const b = spySubscriber();
      const m = msg({ id: 'm1' });
      store.upsert(m);
      store.link('m1', a);
      store.link('m1', b);

      store.unlink('m1', a);
      expect(onRelease).not.toHaveBeenCalled();

      store.unlink('m1', b);
      expect(onRelease).toHaveBeenCalledTimes(1);
      expect(onRelease).toHaveBeenCalledWith(m);
      expect(store.has('m1')).toBe(false);
    });

    it('is not called again when the same holder unlinks twice', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });
      const a = spySubscriber();
      store.upsert(msg({ id: 'm1' }));
      store.link('m1', a);

      store.unlink('m1', a);
      store.unlink('m1', a);
      expect(onRelease).toHaveBeenCalledTimes(1);
    });

    it('does nothing when unlinking a subscriber that is not linked', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });
      const a = spySubscriber();
      const stranger = spySubscriber();
      store.upsert(msg({ id: 'm1' }));
      store.link('m1', a);

      store.unlink('m1', stranger);
      store.unlink('ghost', stranger);
      expect(store.has('m1')).toBe(true);
      expect(onRelease).not.toHaveBeenCalled();
    });

    it('is not called when the last holder of an id with no stored entity unlinks', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });
      const a = spySubscriber();
      store.link('m1', a);

      store.unlink('m1', a);
      expect(onRelease).not.toHaveBeenCalled();
    });
  });

  describe('getOrCreate', () => {
    it('creates, stores and returns the entity when the id is not stored', () => {
      const m = msg({ id: 'm1' });
      const create = vi.fn(() => m);
      const hydrate = vi.fn();

      expect(store.getOrCreate('m1', create, hydrate)).toBe(m);
      expect(store.get('m1')).toBe(m);
      expect(create).toHaveBeenCalledTimes(1);
      expect(hydrate).not.toHaveBeenCalled();
    });

    it('returns the stored entity and hydrates it on a second call, without creating or replacing', () => {
      const m = msg({ id: 'm1' });
      store.getOrCreate('m1', () => m);

      const create = vi.fn(() => msg({ id: 'm1' }));
      const hydrate = vi.fn();
      expect(store.getOrCreate('m1', create, hydrate)).toBe(m);
      expect(store.get('m1')).toBe(m);
      expect(create).not.toHaveBeenCalled();
      expect(hydrate).toHaveBeenCalledTimes(1);
      expect(hydrate).toHaveBeenCalledWith(m);
    });

    it('works without hydrate', () => {
      const m = msg({ id: 'm1' });
      store.upsert(m);
      expect(store.getOrCreate('m1', () => msg({ id: 'm1' }))).toBe(m);
    });

    it('notifies subscribers linked before the entity was created, but not on hydrate', () => {
      const a = spySubscriber();
      store.link('m1', a);

      store.getOrCreate('m1', () => msg({ id: 'm1' }));
      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
      expect([...a.onEntitiesChanged.mock.calls[0][0].changedIds]).toEqual(['m1']);

      store.getOrCreate(
        'm1',
        () => msg({ id: 'm1' }),
        () => undefined,
      );
      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
    });

    it('defers the notification to the end of a transaction', () => {
      const a = spySubscriber();
      store.link('m1', a);

      store.transaction(() => {
        store.getOrCreate('m1', () => msg({ id: 'm1' }));
        expect(a.onEntitiesChanged).not.toHaveBeenCalled();
      });
      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe('changeId', () => {
    it('calls onIdChanged on each moved holder before notifying it', () => {
      const log: string[] = [];
      store.upsert(msg({ id: 'temp' }));
      store.link('temp', {
        onEntitiesChanged: () => log.push('changed'),
        onIdChanged: (oldId, newId) => log.push(`renamed ${oldId} -> ${newId}`),
      });

      store.changeId('temp', 'm1');
      expect(log).toEqual(['renamed temp -> m1', 'changed']);
    });

    it('calls onIdChanged on a holder linked to both ids, and not on holders of the new id only', () => {
      const both = { onEntitiesChanged: vi.fn(), onIdChanged: vi.fn() };
      const newOnly = { onEntitiesChanged: vi.fn(), onIdChanged: vi.fn() };
      store.upsert(msg({ id: 'temp' }));
      store.link('temp', both);
      store.link('m1', both);
      store.link('m1', newOnly);

      store.changeId('temp', 'm1');
      expect(both.onIdChanged).toHaveBeenCalledWith('temp', 'm1');
      expect(newOnly.onIdChanged).not.toHaveBeenCalled();
    });

    it('moves the entity and its holders to the new id', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });
      const a = spySubscriber();
      const m = msg({ id: 'temp' });
      store.upsert(m);
      store.link('temp', a);

      expect(store.changeId('temp', 'm1')).toBe(true);
      expect(store.has('temp')).toBe(false);
      expect(store.get('m1')).toBe(m);

      // the holder moved with the entry: it is notified on the new id and keeps it alive
      a.onEntitiesChanged.mockClear();
      store.upsert({ ...m, id: 'm1' });
      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
      store.unlink('m1', a);
      expect(store.has('m1')).toBe(false);
      expect(onRelease).toHaveBeenCalledTimes(1);
    });

    it('notifies holders that both ids changed', () => {
      const a = spySubscriber();
      store.upsert(msg({ id: 'temp' }));
      store.link('temp', a);

      store.changeId('temp', 'm1');
      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
      expect([...a.onEntitiesChanged.mock.calls[0][0].changedIds].sort()).toEqual([
        'm1',
        'temp',
      ]);
    });

    it('merges the moved holders with holders already linked to the new id', () => {
      const a = spySubscriber();
      const b = spySubscriber();
      store.upsert(msg({ id: 'temp' }));
      store.link('temp', a);
      store.link('m1', b);

      store.changeId('temp', 'm1');
      expect(b.onEntitiesChanged).toHaveBeenCalledTimes(1);

      store.unlink('m1', a);
      expect(store.has('m1')).toBe(true);
      store.unlink('m1', b);
      expect(store.has('m1')).toBe(false);
    });

    it('does nothing on a second call, since the old id is no longer stored', () => {
      const m = msg({ id: 'temp' });
      store.upsert(m);

      expect(store.changeId('temp', 'm1')).toBe(true);
      expect(store.changeId('temp', 'm1')).toBe(false);
      expect(store.get('m1')).toBe(m);
    });

    it('does nothing when the old id is not stored or the ids are equal', () => {
      const a = spySubscriber();
      store.link('ghost', a);
      store.upsert(msg({ id: 'm1' }));

      expect(store.changeId('ghost', 'm2')).toBe(false);
      expect(store.changeId('m1', 'm1')).toBe(false);
      expect(store.has('m1')).toBe(true);
      expect(a.onEntitiesChanged).not.toHaveBeenCalled();
    });

    it('does nothing when the new id already holds an entity', () => {
      const temp = msg({ id: 'temp' });
      const existing = msg({ id: 'm1' });
      store.upsert(temp);
      store.upsert(existing);

      expect(store.changeId('temp', 'm1')).toBe(false);
      expect(store.get('temp')).toBe(temp);
      expect(store.get('m1')).toBe(existing);
    });

    it('carries a flush requested inside a transaction over to the new id', () => {
      const log: string[] = [];
      store.upsert(msg({ id: 'temp' }));
      store.link('temp', {
        onEntitiesChanged: () => log.push('changed'),
        flushState: () => log.push('flushed'),
      });

      store.transaction(() => {
        store.flushSubscribers('temp');
        store.changeId('temp', 'm1');
      });
      expect(log).toEqual(['changed', 'flushed']);
    });
  });

  describe('remove', () => {
    it('removes the entry whatever holds it and releases the entity', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });
      const a = spySubscriber();
      const m = msg({ id: 'm1' });
      store.upsert(m);
      store.link('m1', a);

      store.remove('m1');

      expect(store.has('m1')).toBe(false);
      expect(onRelease).toHaveBeenCalledWith(m);
      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
      expect([...a.onEntitiesChanged.mock.calls[0][0].changedIds]).toEqual(['m1']);
    });

    it('drops the holders, so a later unlink or upsert does not reach them', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });
      const a = spySubscriber();
      store.upsert(msg({ id: 'm1' }));
      store.link('m1', a);
      store.remove('m1');
      a.onEntitiesChanged.mockClear();

      store.unlink('m1', a);
      store.upsert(msg({ id: 'm1' }));

      expect(a.onEntitiesChanged).not.toHaveBeenCalled();
      expect(onRelease).toHaveBeenCalledTimes(1);
    });

    it('does nothing on a second call or for an ID that is not stored', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });
      store.upsert(msg({ id: 'm1' }));

      store.remove('m1');
      store.remove('m1');
      store.remove('ghost');

      expect(onRelease).toHaveBeenCalledTimes(1);
    });
  });

  describe('detach', () => {
    it('removes the entry and tells its holders, without releasing the entity', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });
      const a = spySubscriber();
      const onEntityRemoved = vi.fn();
      const m = msg({ id: 'm1' });
      store.upsert(m);
      store.link('m1', { ...a, onEntityRemoved });

      store.detach('m1');

      expect(store.has('m1')).toBe(false);
      expect(onEntityRemoved).toHaveBeenCalledWith('m1', m);
      expect(onRelease).not.toHaveBeenCalled();
    });

    it('does nothing for an ID that is not stored', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });

      store.detach('ghost');

      expect(onRelease).not.toHaveBeenCalled();
    });
  });

  describe('onEntityRemoved', () => {
    const removalSubscriber = (
      onEntityRemoved: (id: string, entity: unknown) => void,
    ) => ({
      onEntitiesChanged: vi.fn(),
      onEntityRemoved: vi.fn(onEntityRemoved),
    });

    it('is called on every holder by remove(), with the entity still readable', () => {
      const m = msg({ id: 'm1' });
      store.upsert(m);
      const seen: unknown[] = [];
      const a = removalSubscriber((id) => seen.push(store.get(id)));
      const b = removalSubscriber(() => undefined);
      store.link('m1', a);
      store.link('m1', b);

      store.remove('m1');

      expect(a.onEntityRemoved).toHaveBeenCalledWith('m1', m);
      expect(b.onEntityRemoved).toHaveBeenCalledWith('m1', m);
      expect(seen).toEqual([m]);
      expect(store.has('m1')).toBe(false);
    });

    it('lets a holder unlink during the call without releasing the entity twice', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });
      store.upsert(msg({ id: 'm1' }));
      const a = removalSubscriber((id) => store.unlink(id, a));
      store.link('m1', a);

      store.remove('m1');

      expect(onRelease).toHaveBeenCalledTimes(1);
    });

    it('is called by clear() for every entity a holder held', () => {
      const m1 = msg({ id: 'm1' });
      const m2 = msg({ id: 'm2' });
      store.upsert(m1);
      store.upsert(m2);
      const a = removalSubscriber(() => undefined);
      store.link('m1', a);
      store.link('m2', a);

      store.clear();

      expect(a.onEntityRemoved).toHaveBeenCalledWith('m1', m1);
      expect(a.onEntityRemoved).toHaveBeenCalledWith('m2', m2);
    });

    it('is not called when the last holder unlinks', () => {
      store.upsert(msg({ id: 'm1' }));
      const a = removalSubscriber(() => undefined);
      store.link('m1', a);

      store.unlink('m1', a);

      expect(a.onEntityRemoved).not.toHaveBeenCalled();
    });
  });

  describe('values', () => {
    it('returns every stored entity', () => {
      const m1 = msg({ id: 'm1' });
      const m2 = msg({ id: 'm2' });
      store.upsert(m1);
      store.upsert(m2);

      expect(store.values()).toEqual([m1, m2]);
      store.remove('m1');
      expect(store.values()).toEqual([m2]);
    });
  });

  describe('releaseOnLastUnlink: false', () => {
    it('keeps an entry when its last holder unlinks, and releases it on remove()', () => {
      const onRelease = vi.fn();
      const s = new EntityStore<LocalMessage>({
        getEntityId,
        onRelease,
        releaseOnLastUnlink: false,
      });
      const holder = spySubscriber();
      const m = msg({ id: 'm1' });
      s.link('m1', holder);
      s.upsert(m);

      s.unlink('m1', holder);
      expect(s.get('m1')).toBe(m);
      expect(s.isHeld('m1')).toBe(false);
      expect(onRelease).not.toHaveBeenCalled();

      s.remove('m1');
      expect(onRelease).toHaveBeenCalledWith(m);
    });
  });

  describe('isHeld / entries', () => {
    it('reports whether any holder is linked', () => {
      const holder = spySubscriber();
      store.upsert(msg({ id: 'm1' }));
      expect(store.isHeld('m1')).toBe(false);

      store.link('m1', holder);
      expect(store.isHeld('m1')).toBe(true);
    });

    it('names the holders linked to an id, leaving unnamed ones out', () => {
      store.upsert(msg({ id: 'm1' }));
      store.link('m1', { ...spySubscriber(), name: 'list' });
      store.link('m1', spySubscriber());

      expect(store.holderNames('m1')).toEqual(['list']);
      expect(store.holderNames('missing')).toEqual([]);
    });

    it('lists each entity with the id it is stored under', () => {
      const m = msg({ id: 'm1' });
      store.getOrCreate('temp', () => m);

      expect(store.entries()).toEqual([['temp', m]]);
    });
  });

  describe('replacing an entity', () => {
    it('moves an entity onto an id another entity holds only with replace, releasing that one', () => {
      const onRelease = vi.fn();
      const replacing = new EntityStore<LocalMessage>({
        getEntityId: (m) => m.id,
        onRelease,
        releaseOnLastUnlink: false,
      });
      const old = msg({ id: 'm1' });
      const next = msg({ id: 'm1' });
      const list = { ...spySubscriber(), onEntityRemoved: vi.fn() };
      replacing.upsert(old);
      replacing.link('m1', list);
      replacing.getOrCreate('temp', () => next);

      expect(replacing.changeId('temp', 'm1')).toBe(false);
      expect(replacing.changeId('temp', 'm1', { replace: true })).toBe(true);

      expect(replacing.get('m1')).toBe(next);
      expect(replacing.get('temp')).toBeUndefined();
      expect(replacing.isHeldBy('m1', list)).toBe(true);
      expect(list.onEntityRemoved).not.toHaveBeenCalled();
      expect(onRelease).toHaveBeenCalledWith(old);
      expect(onRelease).not.toHaveBeenCalledWith(next);
    });

    it('stores an entity in place of the one under its id, keeping its holders', () => {
      const onRelease = vi.fn();
      const replacing = new EntityStore<LocalMessage>({
        getEntityId: (m) => m.id,
        onRelease,
      });
      const old = msg({ id: 'm1' });
      const next = msg({ id: 'm1' });
      const list = { ...spySubscriber(), onEntityRemoved: vi.fn() };
      replacing.upsert(old);
      replacing.link('m1', list);

      replacing.replace(next);
      replacing.replace(next);

      expect(replacing.get('m1')).toBe(next);
      expect(replacing.isHeldBy('m1', list)).toBe(true);
      expect(list.onEntityRemoved).not.toHaveBeenCalled();
      expect(onRelease).toHaveBeenCalledTimes(1);
      expect(onRelease).toHaveBeenCalledWith(old);
    });
  });

  describe('addClaim', () => {
    it('holds the entities its heldBy lists, until it is removed', () => {
      const m1 = msg({ id: 'm1' });
      const m2 = msg({ id: 'm2' });
      store.upsert(m1);
      store.upsert(m2);
      const unregister = store.addClaim({ heldBy: () => [m1], name: 'composer' });

      expect(store.isHeld('m1')).toBe(true);
      expect(store.holderNames('m1')).toEqual(['composer']);
      expect(store.unheldEntries()).toEqual([['m2', m2]]);

      unregister();
      expect(store.isHeld('m1')).toBe(false);
    });

    it('names a claim once for an entity it lists several times', () => {
      const m = msg({ id: 'm1' });
      store.upsert(m);
      store.addClaim({ heldBy: () => [m, m, m], name: 'threads' });
      store.addClaim({ heldBy: () => [m], name: 'composer' });

      expect(store.holderNames('m1')).toEqual(['threads', 'composer']);
    });

    it('finds an entity stored under an id other than its own, by identity', () => {
      const m = msg({ id: 'm1' });
      store.getOrCreate('temp', () => m);
      store.addClaim({ heldBy: () => [m], name: 'composer' });

      expect(store.isHeld('temp')).toBe(true);
      expect(store.unheldEntries()).toEqual([]);
    });

    it('reads heldBy when asked, so a change needs no report', () => {
      const m = msg({ id: 'm1' });
      store.upsert(m);
      let held: LocalMessage[] = [];
      store.addClaim({ heldBy: () => held });

      expect(store.isHeld('m1')).toBe(false);
      held = [m];
      expect(store.isHeld('m1')).toBe(true);
    });
  });

  describe('clear', () => {
    it('removes every entry and holder and releases each entity', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });
      const a = spySubscriber();
      const m1 = msg({ id: 'm1' });
      const m2 = msg({ id: 'm2' });
      store.upsert(m1);
      store.upsert(m2);
      store.link('m1', a);

      store.clear();
      expect(store.has('m1')).toBe(false);
      expect(store.has('m2')).toBe(false);
      expect(onRelease).toHaveBeenCalledTimes(2);
      expect(onRelease).toHaveBeenCalledWith(m1);
      expect(onRelease).toHaveBeenCalledWith(m2);

      // dropped holders are neither notified nor able to re-trigger a release
      store.upsert(msg({ id: 'm1' }));
      expect(a.onEntitiesChanged).not.toHaveBeenCalled();
      store.unlink('m1', a);
      expect(store.has('m1')).toBe(true);
      expect(onRelease).toHaveBeenCalledTimes(2);
    });

    it('does nothing on a second call', () => {
      const onRelease = vi.fn();
      store = new EntityStore<LocalMessage>({ getEntityId, onRelease });
      store.upsert(msg({ id: 'm1' }));

      store.clear();
      store.clear();
      expect(onRelease).toHaveBeenCalledTimes(1);
    });

    it('releases after the store is emptied', () => {
      const seen: boolean[] = [];
      store = new EntityStore<LocalMessage>({
        getEntityId,
        onRelease: (m) => seen.push(store.has(m.id)),
      });
      store.upsert(msg({ id: 'm1' }));

      store.clear();
      expect(seen).toEqual([false]);
    });

    it('drops notifications pending in an open transaction', () => {
      const a = spySubscriber();
      store.link('m1', a);

      store.transaction(() => {
        store.upsert(msg({ id: 'm1' }));
        store.clear();
      });
      expect(a.onEntitiesChanged).not.toHaveBeenCalled();
    });
  });
});
