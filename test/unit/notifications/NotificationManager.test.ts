import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationManager } from '../../../src';

describe('NotificationManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('sorts notifications with the configured comparator', () => {
    const manager = new NotificationManager({
      sortComparator: (a, b) => {
        const aTimed = !!a.duration;
        const bTimed = !!b.duration;

        if (aTimed !== bTimed) return aTimed ? -1 : 1;
        return a.createdAt - b.createdAt;
      },
    });

    vi.setSystemTime(new Date('2026-03-13T10:00:00.000Z'));
    manager.addInfo({
      message: 'persistent',
      origin: { emitter: 'test' },
      options: { duration: 0 },
    });

    vi.setSystemTime(new Date('2026-03-13T10:00:01.000Z'));
    manager.addInfo({ message: 'timed', origin: { emitter: 'test' } });

    expect(manager.notifications.map(({ message }) => message)).toEqual([
      'timed',
      'persistent',
    ]);
  });

  it('stores severity as undefined by default', () => {
    const manager = new NotificationManager();

    manager.add({
      message: 'plain',
      origin: { emitter: 'test' },
    });

    expect(manager.notifications[0]).toMatchObject({
      duration: undefined,
      severity: undefined,
    });
  });

  it('stores configured duration for severity-based notifications', () => {
    const manager = new NotificationManager();

    manager.addInfo({
      message: 'timed',
      origin: { emitter: 'test' },
    });

    expect(manager.notifications[0]).toMatchObject({
      duration: 3000,
      severity: 'info',
    });
  });

  it('stores tags on the notification', () => {
    const manager = new NotificationManager();

    manager.addError({
      message: 'tagged',
      origin: { emitter: 'test' },
      options: { tags: ['composer', 'upload'] },
    });

    expect(manager.notifications[0]).toMatchObject({
      severity: 'error',
      tags: ['composer', 'upload'],
    });
  });

  it('starts removal timeout only when startTimeout is triggered', () => {
    const manager = new NotificationManager();

    const notificationId = manager.addInfo({
      message: 'timed',
      origin: { emitter: 'test' },
      options: { duration: 1000 },
    });

    vi.advanceTimersByTime(1000);
    expect(manager.notifications).toHaveLength(1);

    manager.startTimeout(notificationId);
    vi.advanceTimersByTime(999);
    expect(manager.notifications).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(manager.notifications).toHaveLength(0);
  });

  it('restarts timeout when startTimeout is called again for the same notification', () => {
    const manager = new NotificationManager();

    const notificationId = manager.addInfo({
      message: 'timed',
      origin: { emitter: 'test' },
      options: { duration: 1000 },
    });

    manager.startTimeout(notificationId);
    vi.advanceTimersByTime(500);

    manager.startTimeout(notificationId);
    vi.advanceTimersByTime(999);
    expect(manager.notifications).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(manager.notifications).toHaveLength(0);
  });

  it('treats missing duration as a no-op unless an override is provided', () => {
    const manager = new NotificationManager();

    const notificationId = manager.addInfo({
      message: 'persistent',
      origin: { emitter: 'test' },
      options: { duration: 0 },
    });

    manager.startTimeout(notificationId);
    vi.advanceTimersByTime(1000);
    expect(manager.notifications).toHaveLength(1);

    manager.startTimeout(notificationId, 250);
    vi.advanceTimersByTime(249);
    expect(manager.notifications).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(manager.notifications).toHaveLength(0);
  });
});
