import { describe, expect, it, vi } from 'vitest';
import { UploadManager } from '../../../src';

describe('UploadManager', () => {
  it('startUpload upserts uploading record and calls uploadMethod with uri', async () => {
    const manager = new UploadManager();
    const uploadMethod = vi.fn().mockResolvedValue(undefined);

    const promise = manager.startUpload({ uri: 'file://a', uploadMethod });

    expect(manager.uploads).toEqual([
      {
        uri: 'file://a',
        messageId: undefined,
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

  it('stores messageId on upload record when provided', async () => {
    const manager = new UploadManager();
    const uploadMethod = vi.fn().mockResolvedValue(undefined);

    await manager.startUpload({ uri: 'u', messageId: 'm1', uploadMethod });

    // Upload is cleared on success; verify messageId was present on finished snapshot.
    const snapshots: unknown[] = [];
    const manager2 = new UploadManager();
    const unsub = manager2.state.subscribe((next) => snapshots.push(next.uploads));
    await manager2.startUpload({ uri: 'u', messageId: 'm1', uploadMethod });
    unsub();

    expect(
      snapshots.some(
        (u: any) =>
          u?.[0]?.uri === 'u' &&
          u?.[0]?.state === 'finished' &&
          u?.[0]?.messageId === 'm1',
      ),
    ).toBe(true);
  });

  it('updates uploadProgress when onProgress is invoked (including undefined)', async () => {
    const manager = new UploadManager();
    let onProgress!: (p?: number) => void;
    const uploadMethod = vi.fn().mockImplementation(async ({ onProgress: cb }) => {
      onProgress = cb!;
    });

    const start = manager.startUpload({ uri: 'u', uploadMethod });
    onProgress(33);
    expect(manager.getUpload('u')?.uploadProgress).toBe(33);
    onProgress(undefined);
    expect(manager.getUpload('u')?.uploadProgress).toBeUndefined();
    await start;
  });

  it('on failure, sets failed state, clears progress, stores error, and does not throw', async () => {
    const manager = new UploadManager();
    const err = new Error('boom');
    const uploadMethod = vi.fn().mockRejectedValue(err);

    await expect(
      manager.startUpload({ uri: 'u', uploadMethod }),
    ).resolves.toBeUndefined();

    expect(manager.getUpload('u')).toEqual({
      uri: 'u',
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
    void manager.startUpload({ uri: 'u2', uploadMethod: never });
    await manager.retryUploads((u) => u.uri === 'u2');
    expect(uploadMethod).not.toHaveBeenCalled();
  });

  it('retryUploads restarts only failed uploads that match the predicate', async () => {
    const manager = new UploadManager();
    const err = new Error('fail');
    const uploadMethod = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(undefined);

    await manager.startUpload({ uri: 'u', uploadMethod });
    expect(manager.getUpload('u')?.state).toBe('failed');

    await manager.retryUploads((u) => u.uri === 'u');

    expect(uploadMethod).toHaveBeenCalledTimes(2);
  });

  it('retryUploads retries every matching failed upload in parallel', async () => {
    const manager = new UploadManager();
    const err = new Error('fail');
    const uploadA = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(undefined);
    const uploadB = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(undefined);

    await manager.startUpload({ uri: 'a', messageId: 'm1', uploadMethod: uploadA });
    await manager.startUpload({ uri: 'b', messageId: 'm2', uploadMethod: uploadB });

    await manager.retryUploads((u) => u.messageId === 'm1' || u.messageId === 'm2');

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

    await manager.startUpload({ uri: 'u', messageId: 'm1', uploadMethod });
    manager.reset();

    expect(manager.uploads).toEqual([]);
    await manager.retryUploads((u) => u.uri === 'u' && u.messageId === 'm1');
    expect(uploadMethod).toHaveBeenCalledTimes(1);
  });

  it('dedupes startUpload: existing uri prevents starting a second upload', async () => {
    const manager = new UploadManager();
    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });
    const uploadMethod = vi.fn().mockImplementation(async () => gate);

    void manager.startUpload({ uri: 'u', uploadMethod });
    await manager.startUpload({ uri: 'u', uploadMethod });

    expect(uploadMethod).toHaveBeenCalledTimes(1);
    resolve();
  });

  it('when messageId is provided, it is used to find/dedupe uploads', async () => {
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

    void manager.startUpload({ uri: 'u', messageId: 'm1', uploadMethod: uploadMethodA });
    void manager.startUpload({ uri: 'u', messageId: 'm2', uploadMethod: uploadMethodB });

    expect(manager.getUpload('u', 'm1')?.state).toBe('uploading');
    expect(manager.getUpload('u', 'm2')?.state).toBe('uploading');

    // Dedupe only within the same (uri,messageId) pair.
    await manager.startUpload({ uri: 'u', messageId: 'm1', uploadMethod: uploadMethodA });
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

    await manager.startUpload({ uri: 'u', uploadMethod });

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

      await manager.startUpload({ uri: 'a', messageId: 'm1', uploadMethod: uploadA });
      await manager.startUpload({ uri: 'b', messageId: 'm2', uploadMethod: uploadB });

      expect(manager.getUpload('a', 'm1')?.state).toBe('finished');
      expect(manager.getUpload('b', 'm2')?.state).toBe('finished');

      manager.deleteUploadRecords((u) => u.messageId === 'm1');

      expect(manager.getUpload('a', 'm1')).toBeUndefined();
      expect(manager.getUpload('b', 'm2')?.state).toBe('finished');
    });

    it('removes failed records so retryUploads has nothing to match', async () => {
      const manager = new UploadManager();
      const err = new Error('fail');
      const uploadMethod = vi
        .fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce(undefined);

      await manager.startUpload({ uri: 'u', messageId: 'm1', uploadMethod });
      expect(manager.getUpload('u', 'm1')?.state).toBe('failed');

      manager.deleteUploadRecords((u) => u.messageId === 'm1');

      await manager.retryUploads((u) => u.uri === 'u' && u.messageId === 'm1');
      expect(uploadMethod).toHaveBeenCalledTimes(1);
    });

    it('retryUploads throws when a matching failed upload has no stored method', async () => {
      const manager = new UploadManager();
      const err = new Error('fail');
      const uploadMethod = vi.fn().mockRejectedValue(err);

      await manager.startUpload({ uri: 'u', messageId: 'm1', uploadMethod });
      expect(manager.getUpload('u', 'm1')?.state).toBe('failed');

      const internal = manager as unknown as { uploadMethods: Map<string, unknown> };
      internal.uploadMethods.clear();

      await expect(manager.retryUploads(() => true)).rejects.toThrow(
        /missing upload method for uri="u" messageId="m1"/,
      );
      expect(uploadMethod).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when nothing matches', () => {
      const manager = new UploadManager();
      const uploadMethod = vi.fn().mockResolvedValue(undefined);
      void manager.startUpload({ uri: 'u', messageId: 'm1', uploadMethod });

      manager.deleteUploadRecords(() => false);

      expect(manager.getUpload('u', 'm1')?.state).toBe('uploading');
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
      void manager.startUpload({ uri: 'file://a', uploadMethod });

      await expect(
        manager.waitForUploads((u) => u.uri === 'file://a'),
      ).resolves.toBeUndefined();

      expect(manager.getUpload('file://a')?.state).toBe('finished');
    });

    it('resolves when a matching upload fails', async () => {
      const manager = new UploadManager();
      const uploadMethod = vi.fn().mockRejectedValue(new Error('fail'));
      void manager.startUpload({ uri: 'file://a', uploadMethod });

      await expect(
        manager.waitForUploads((u) => u.uri === 'file://a'),
      ).resolves.toBeUndefined();

      expect(manager.getUpload('file://a')?.state).toBe('failed');
    });

    it('waits only for uploads that match the predicate', async () => {
      const manager = new UploadManager();
      let slowDone!: () => void;
      const slow = new Promise<void>((r) => {
        slowDone = r;
      });
      const uploadSlow = vi.fn().mockImplementation(async () => slow);
      const uploadFast = vi.fn().mockResolvedValue(undefined);

      void manager.startUpload({ uri: 'slow', uploadMethod: uploadSlow });
      void manager.startUpload({ uri: 'fast', uploadMethod: uploadFast });

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
      void manager.startUpload({ uri: 'u', uploadMethod });

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
      void manager.startUpload({ uri: 'a', messageId: 'm1', uploadMethod });
      void manager.startUpload({ uri: 'b', messageId: 'm1', uploadMethod });

      await expect(
        manager.waitForUploads((u) => u.messageId === 'm1'),
      ).resolves.toBeUndefined();
    });
  });
});
