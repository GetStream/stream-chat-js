import { describe, expect, it, vi } from 'vitest';
import { UploadManager } from '../../../src';

describe('UploadManager', () => {
  it('upload upserts uploading record and calls uploadMethod with uri', async () => {
    const manager = new UploadManager();
    const uploadMethod = vi.fn().mockResolvedValue(undefined);

    const promise = manager.upload({
      uri: 'file://a',
      localId: 'local-a',
      uploadMethod,
    });

    expect(manager.uploads).toEqual([
      {
        uri: 'file://a',
        localId: 'local-a',
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

  it('stores localId on upload record', async () => {
    const manager = new UploadManager();
    const uploadMethod = vi.fn().mockResolvedValue(undefined);

    await manager.upload({ uri: 'u', localId: 'm1', uploadMethod });

    const snapshots: unknown[] = [];
    const manager2 = new UploadManager();
    const unsub = manager2.state.subscribe((next) => snapshots.push(next.uploads));
    await manager2.upload({ uri: 'u', localId: 'm1', uploadMethod });
    unsub();

    expect(
      snapshots.some(
        (u: any) =>
          u?.[0]?.uri === 'u' && u?.[0]?.state === 'finished' && u?.[0]?.localId === 'm1',
      ),
    ).toBe(true);
  });

  it('updates uploadProgress when onProgress is invoked (including undefined)', async () => {
    const manager = new UploadManager();
    let onProgress!: (p?: number) => void;
    const uploadMethod = vi.fn().mockImplementation(async ({ onProgress: cb }) => {
      onProgress = cb!;
    });

    const start = manager.upload({ uri: 'u', localId: 'u1', uploadMethod });
    onProgress(33);
    expect(manager.getUpload('u1')?.uploadProgress).toBe(33);
    onProgress(undefined);
    expect(manager.getUpload('u1')?.uploadProgress).toBeUndefined();
    await start;
  });

  it('on failure, sets failed state, clears progress, stores error, and does not throw', async () => {
    const manager = new UploadManager();
    const err = new Error('boom');
    const uploadMethod = vi.fn().mockRejectedValue(err);

    await expect(
      manager.upload({ uri: 'u', localId: 'u1', uploadMethod }),
    ).resolves.toBeUndefined();

    expect(manager.getUpload('u1')).toEqual({
      uri: 'u',
      localId: 'u1',
      state: 'failed',
      uploadProgress: undefined,
      error: err,
    });
  });

  it('retryUploads is a no-op when state is not failed', async () => {
    const manager = new UploadManager();
    const uploadMethod = vi.fn().mockResolvedValue(undefined);

    await manager.retryUploads(() => true);
    expect(uploadMethod).not.toHaveBeenCalled();

    // Start creates record; retry during uploading should no-op
    const never = vi.fn().mockImplementation(() => new Promise(() => {}));
    void manager.upload({ uri: 'u2', localId: 'u2', uploadMethod: never });
    await manager.retryUploads((u) => u.localId === 'u2');
    expect(uploadMethod).not.toHaveBeenCalled();
  });

  it('retryUploads restarts only failed uploads that match the predicate', async () => {
    const manager = new UploadManager();
    const err = new Error('fail');
    const uploadMethod = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(undefined);

    await manager.upload({ uri: 'u', localId: 'u1', uploadMethod });
    expect(manager.getUpload('u1')?.state).toBe('failed');

    await manager.retryUploads((u) => u.localId === 'u1');

    expect(uploadMethod).toHaveBeenCalledTimes(2);
  });

  it('retryUploads retries every matching failed upload in parallel', async () => {
    const manager = new UploadManager();
    const err = new Error('fail');
    const uploadA = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(undefined);
    const uploadB = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(undefined);

    await manager.upload({ uri: 'a', localId: 'm1', uploadMethod: uploadA });
    await manager.upload({ uri: 'b', localId: 'm2', uploadMethod: uploadB });

    await manager.retryUploads((u) => u.localId === 'm1' || u.localId === 'm2');

    expect(uploadA).toHaveBeenCalledTimes(2);
    expect(uploadB).toHaveBeenCalledTimes(2);
  });

  it('reset clears all records and drops retry handles', async () => {
    const manager = new UploadManager();
    const err = new Error('fail');
    const uploadMethod = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(undefined);

    await manager.upload({ uri: 'u', localId: 'm1', uploadMethod });
    manager.reset();

    expect(manager.uploads).toEqual([]);
    await manager.retryUploads((u) => u.uri === 'u' && u.localId === 'm1');
    expect(uploadMethod).toHaveBeenCalledTimes(1);
  });

  it('dedupes upload: existing localId prevents starting a second upload', async () => {
    const manager = new UploadManager();
    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });
    const uploadMethod = vi.fn().mockImplementation(async () => gate);

    void manager.upload({ uri: 'u', localId: 'same', uploadMethod });
    await manager.upload({ uri: 'u', localId: 'same', uploadMethod });

    expect(uploadMethod).toHaveBeenCalledTimes(1);
    resolve();
  });

  it('different localIds allow concurrent uploads for the same uri', async () => {
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

    void manager.upload({ uri: 'u', localId: 'm1', uploadMethod: uploadMethodA });
    void manager.upload({ uri: 'u', localId: 'm2', uploadMethod: uploadMethodB });

    expect(manager.getUpload('m1')?.state).toBe('uploading');
    expect(manager.getUpload('m2')?.state).toBe('uploading');

    await manager.upload({ uri: 'u', localId: 'm1', uploadMethod: uploadMethodA });
    expect(uploadMethodA).toHaveBeenCalledTimes(1);
    expect(uploadMethodB).toHaveBeenCalledTimes(1);

    resolveA();
    resolveB();
  });

  it('on success, transitions to finished', async () => {
    const manager = new UploadManager();
    const uploadMethod = vi.fn().mockResolvedValue(undefined);

    const snapshots: unknown[] = [];
    const unsub = manager.state.subscribe((next) => snapshots.push(next.uploads));

    await manager.upload({ uri: 'u', localId: 'u1', uploadMethod });

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

      await manager.upload({ uri: 'a', localId: 'm1', uploadMethod: uploadA });
      await manager.upload({ uri: 'b', localId: 'm2', uploadMethod: uploadB });

      expect(manager.getUpload('m1')?.state).toBe('finished');
      expect(manager.getUpload('m2')?.state).toBe('finished');

      manager.deleteUploadRecords((u) => u.localId === 'm1');

      expect(manager.getUpload('m1')).toBeUndefined();
      expect(manager.getUpload('m2')?.state).toBe('finished');
    });

    it('removes failed records so retryUploads has nothing to match', async () => {
      const manager = new UploadManager();
      const err = new Error('fail');
      const uploadMethod = vi
        .fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce(undefined);

      await manager.upload({ uri: 'u', localId: 'm1', uploadMethod });
      expect(manager.getUpload('m1')?.state).toBe('failed');

      manager.deleteUploadRecords((u) => u.localId === 'm1');

      await manager.retryUploads((u) => u.uri === 'u' && u.localId === 'm1');
      expect(uploadMethod).toHaveBeenCalledTimes(1);
    });

    it('retryUploads throws when a matching failed upload has no stored method', async () => {
      const manager = new UploadManager();
      const err = new Error('fail');
      const uploadMethod = vi.fn().mockRejectedValue(err);

      await manager.upload({ uri: 'u', localId: 'm1', uploadMethod });
      expect(manager.getUpload('m1')?.state).toBe('failed');

      const internal = manager as unknown as { uploadMethods: Map<string, unknown> };
      internal.uploadMethods.clear();

      await expect(manager.retryUploads(() => true)).rejects.toThrow(
        /missing upload method for uri="u" localId="m1"/,
      );
      expect(uploadMethod).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when nothing matches', () => {
      const manager = new UploadManager();
      const uploadMethod = vi.fn().mockResolvedValue(undefined);
      void manager.upload({ uri: 'u', localId: 'm1', uploadMethod });

      manager.deleteUploadRecords(() => false);

      expect(manager.getUpload('m1')?.state).toBe('uploading');
    });
  });

  describe('waitForUploads', () => {
    it('resolves immediately when no uploads match the predicate', async () => {
      const manager = new UploadManager();
      await expect(manager.waitForUploads(() => true)).resolves.toBeUndefined();
    });

    it('resolves when a matching upload succeeds', async () => {
      const manager = new UploadManager();
      const uploadMethod = vi.fn().mockResolvedValue({ ok: true });
      void manager.upload({ uri: 'file://a', localId: 'a1', uploadMethod });

      await expect(
        manager.waitForUploads((u) => u.uri === 'file://a'),
      ).resolves.toBeUndefined();

      expect(manager.getUpload('a1')?.state).toBe('finished');
    });

    it('resolves when a matching upload fails', async () => {
      const manager = new UploadManager();
      const uploadMethod = vi.fn().mockRejectedValue(new Error('fail'));
      void manager.upload({ uri: 'file://a', localId: 'a1', uploadMethod });

      await expect(
        manager.waitForUploads((u) => u.uri === 'file://a'),
      ).resolves.toBeUndefined();

      expect(manager.getUpload('a1')?.state).toBe('failed');
    });

    it('waits only for uploads that match the predicate', async () => {
      const manager = new UploadManager();
      let slowDone!: () => void;
      const slow = new Promise<void>((r) => {
        slowDone = r;
      });
      const uploadSlow = vi.fn().mockImplementation(async () => slow);
      const uploadFast = vi.fn().mockResolvedValue(undefined);

      void manager.upload({
        uri: 'slow',
        localId: 'slow',
        uploadMethod: uploadSlow,
      });
      void manager.upload({
        uri: 'fast',
        localId: 'fast',
        uploadMethod: uploadFast,
      });

      const waited = manager.waitForUploads((u) => u.uri === 'slow');
      let settled = false;
      void waited.then(() => {
        settled = true;
      });

      await vi.waitFor(() => expect(manager.getUpload('fast')?.state).toBe('finished'));
      expect(settled).toBe(false);

      slowDone();
      await expect(waited).resolves.toBeUndefined();
    });

    it('rejects when the predicate throws while matching uploads exist', async () => {
      const manager = new UploadManager();
      const uploadMethod = vi.fn().mockImplementation(() => new Promise(() => {}));
      void manager.upload({ uri: 'u', localId: 'u1', uploadMethod });

      const err = new Error('predicate boom');
      await expect(
        manager.waitForUploads(() => {
          throw err;
        }),
      ).rejects.toBe(err);
    });

    it('resolves when all matching uploads are terminal', async () => {
      const manager = new UploadManager();
      const uploadMethod = vi.fn().mockResolvedValue(undefined);
      void manager.upload({ uri: 'a', localId: 'x1', uploadMethod });
      void manager.upload({ uri: 'b', localId: 'x2', uploadMethod });

      await expect(
        manager.waitForUploads((u) => u.localId === 'x1' || u.localId === 'x2'),
      ).resolves.toBeUndefined();
    });
  });
});
