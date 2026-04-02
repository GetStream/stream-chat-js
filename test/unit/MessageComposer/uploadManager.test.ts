import { describe, expect, it, vi } from 'vitest';
import { UploadManager } from '../../../src';

describe('UploadManager', () => {
  it('upload upserts uploading record and calls uploadMethod with onProgress', async () => {
    const manager = new UploadManager();
    const uploadMethod = vi.fn().mockResolvedValue(undefined);

    const promise = manager.upload({
      id: 'local-a',
      uploadMethod,
    });

    expect(manager.uploads).toEqual([
      {
        id: 'local-a',
        state: 'uploading',
        uploadProgress: 0,
        error: undefined,
      },
    ]);
    await promise;

    expect(uploadMethod).toHaveBeenCalledWith(
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
  });

  it('stores id on upload record', async () => {
    const manager = new UploadManager();
    const uploadMethod = vi.fn().mockResolvedValue(undefined);

    await manager.upload({ id: 'm1', uploadMethod });

    const snapshots: unknown[] = [];
    const manager2 = new UploadManager();
    const unsub = manager2.state.subscribe((next) => snapshots.push(next.uploads));
    await manager2.upload({ id: 'm1', uploadMethod });
    unsub();

    expect(
      snapshots.some((u: any) => u?.[0]?.state === 'finished' && u?.[0]?.id === 'm1'),
    ).toBe(true);
  });

  it('updates uploadProgress when onProgress is invoked (including undefined)', async () => {
    const manager = new UploadManager();
    let onProgress!: (p?: number) => void;
    const uploadMethod = vi.fn().mockImplementation(async ({ onProgress: cb }) => {
      onProgress = cb!;
    });

    const start = manager.upload({ id: 'u1', uploadMethod });
    onProgress(33);
    expect(manager.getUpload('u1')?.uploadProgress).toBe(33);
    onProgress(undefined);
    expect(manager.getUpload('u1')?.uploadProgress).toBeUndefined();
    await start;
  });

  it('on failure, sets failed state, clears progress, stores error, and rejects the promise', async () => {
    const manager = new UploadManager();
    const err = new Error('boom');
    const uploadMethod = vi.fn().mockRejectedValue(err);

    await expect(manager.upload({ id: 'u1', uploadMethod })).rejects.toBe(err);

    expect(manager.getUpload('u1')).toEqual({
      id: 'u1',
      state: 'failed',
      uploadProgress: undefined,
      error: err,
    });
  });

  it('reset clears all records', async () => {
    const manager = new UploadManager();
    const err = new Error('fail');
    const uploadMethod = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(undefined);

    await expect(manager.upload({ id: 'm1', uploadMethod })).rejects.toBe(err);
    manager.reset();

    expect(manager.uploads).toEqual([]);
    expect(uploadMethod).toHaveBeenCalledTimes(1);
  });

  it('dedupes upload: concurrent calls share one promise and a single uploadMethod run', async () => {
    const manager = new UploadManager();
    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });
    const uploadMethod = vi.fn().mockImplementation(async () => gate);

    const first = manager.upload({ id: 'same', uploadMethod });
    const second = manager.upload({ id: 'same', uploadMethod });

    expect(first).toBe(second);
    expect(uploadMethod).toHaveBeenCalledTimes(1);

    resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });

  it('different ids allow concurrent uploads', async () => {
    const manager = new UploadManager();
    let resolveA!: () => void;
    let resolveB!: () => void;
    const gateA = new Promise<void>((r) => {
      resolveA = r;
    });
    const gateB = new Promise<void>((r) => {
      resolveB = r;
    });

    const uploadMethodA = vi.fn().mockImplementation(async () => gateA);
    const uploadMethodB = vi.fn().mockImplementation(async () => gateB);

    const p1 = manager.upload({ id: 'm1', uploadMethod: uploadMethodA });
    const p2 = manager.upload({ id: 'm2', uploadMethod: uploadMethodB });

    expect(manager.getUpload('m1')?.state).toBe('uploading');
    expect(manager.getUpload('m2')?.state).toBe('uploading');

    const p1Again = manager.upload({ id: 'm1', uploadMethod: uploadMethodA });
    expect(p1Again).toBe(p1);
    expect(uploadMethodA).toHaveBeenCalledTimes(1);
    expect(uploadMethodB).toHaveBeenCalledTimes(1);

    resolveA();
    resolveB();
    await Promise.all([p1, p2]);
  });

  it('on success, transitions to finished', async () => {
    const manager = new UploadManager();
    const uploadMethod = vi.fn().mockResolvedValue(undefined);

    const snapshots: unknown[] = [];
    const unsub = manager.state.subscribe((next) => snapshots.push(next.uploads));

    await manager.upload({ id: 'u1', uploadMethod });

    // Expect: uploading -> finished -> removed
    expect(snapshots.some((u: any) => u?.[0]?.state === 'uploading')).toBe(true);
    expect(snapshots.some((u: any) => u?.[0]?.state === 'finished')).toBe(true);

    unsub();
  });

  describe('deleteUploadRecords', () => {
    it('removes matching records and leaves others', async () => {
      const manager = new UploadManager();
      const uploadA = vi.fn().mockResolvedValue(undefined);
      const uploadB = vi.fn().mockResolvedValue(undefined);

      await manager.upload({ id: 'm1', uploadMethod: uploadA });
      await manager.upload({ id: 'm2', uploadMethod: uploadB });

      expect(manager.getUpload('m1')?.state).toBe('finished');
      expect(manager.getUpload('m2')?.state).toBe('finished');

      manager.deleteUploadRecords((u) => u.id === 'm1');

      expect(manager.getUpload('m1')).toBeUndefined();
      expect(manager.getUpload('m2')?.state).toBe('finished');
    });

    it('removes failed records and does not trigger another upload', async () => {
      const manager = new UploadManager();
      const err = new Error('fail');
      const uploadMethod = vi.fn().mockRejectedValue(err);

      await expect(manager.upload({ id: 'm1', uploadMethod })).rejects.toBe(err);
      expect(manager.getUpload('m1')?.state).toBe('failed');

      manager.deleteUploadRecords((u) => u.id === 'm1');

      expect(manager.getUpload('m1')).toBeUndefined();
      expect(uploadMethod).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when nothing matches', () => {
      const manager = new UploadManager();
      const uploadMethod = vi.fn().mockResolvedValue(undefined);
      void manager.upload({ id: 'm1', uploadMethod });

      manager.deleteUploadRecords(() => false);

      expect(manager.getUpload('m1')?.state).toBe('uploading');
    });
  });
});
