import { describe, expect, it, vi } from 'vitest';
import type { StreamChat } from '../../../src';
import { UploadManager } from '../../../src';

const TEST_CID = 'channelType:channelId';

const createManager = (
  doUploadRequest: (...args: unknown[]) => unknown = vi.fn().mockResolvedValue(undefined),
  trackUploadProgress = true,
) => {
  const attachmentManager = {
    doUploadRequest,
    config: { trackUploadProgress },
  };
  const client = {
    channel: vi.fn().mockReturnValue({
      messageComposer: { attachmentManager },
    }),
  } as unknown as StreamChat;
  const manager = new UploadManager(client);
  return { manager, client, doUploadRequest };
};

describe('UploadManager', () => {
  it('upload upserts uploading record and calls doUploadRequest with onProgress', async () => {
    const { manager, doUploadRequest } = createManager();
    const file = new File([], 'a.txt');

    const promise = manager.upload({
      id: 'local-a',
      channelCid: TEST_CID,
      file,
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

    expect(doUploadRequest).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
  });

  it('stores id on upload record', async () => {
    const { manager, doUploadRequest } = createManager();
    const file = new File([], 'a.txt');

    await manager.upload({ id: 'm1', channelCid: TEST_CID, file });

    const snapshots: unknown[] = [];
    const { manager: manager2, doUploadRequest: doUploadRequest2 } = createManager();
    const unsub = manager2.state.subscribe((next) => snapshots.push(next.uploads));
    await manager2.upload({
      id: 'm1',
      channelCid: TEST_CID,
      file: new File([], 'b.txt'),
    });
    unsub();

    expect(
      snapshots.some((u: any) => u?.[0]?.state === 'finished' && u?.[0]?.id === 'm1'),
    ).toBe(true);
    expect(doUploadRequest).toHaveBeenCalled();
    expect(doUploadRequest2).toHaveBeenCalled();
  });

  it('updates uploadProgress when onProgress is invoked (including undefined)', async () => {
    const { manager, doUploadRequest } = createManager();
    let onProgress!: (p?: number) => void;
    doUploadRequest.mockImplementation(
      async (_file: unknown, opts?: { onProgress?: (n?: number) => void }) => {
        onProgress = opts!.onProgress!;
      },
    );

    const start = manager.upload({
      id: 'u1',
      channelCid: TEST_CID,
      file: new File([], 'x'),
    });
    onProgress(33);
    expect(manager.getUpload('u1')?.uploadProgress).toBe(33);
    onProgress(undefined);
    expect(manager.getUpload('u1')?.uploadProgress).toBeUndefined();
    await start;
  });

  it('on failure, sets failed state, clears progress, stores error, and rejects the promise', async () => {
    const err = new Error('boom');
    const { manager, doUploadRequest } = createManager(vi.fn().mockRejectedValue(err));

    await expect(
      manager.upload({
        id: 'u1',
        channelCid: TEST_CID,
        file: new File([], 'x'),
      }),
    ).rejects.toBe(err);

    expect(manager.getUpload('u1')).toEqual({
      id: 'u1',
      state: 'failed',
      uploadProgress: undefined,
      error: err,
    });
  });

  it('reset clears all records', async () => {
    const err = new Error('fail');
    const { manager, doUploadRequest } = createManager(
      vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(undefined),
    );

    await expect(
      manager.upload({ id: 'm1', channelCid: TEST_CID, file: new File([], 'a') }),
    ).rejects.toBe(err);
    manager.reset();

    expect(manager.uploads).toEqual([]);
    expect(doUploadRequest).toHaveBeenCalledTimes(1);
  });

  it('dedupes upload: concurrent calls share one promise and a single doUploadRequest run', async () => {
    const { manager, doUploadRequest } = createManager();
    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });
    doUploadRequest.mockImplementation(async () => gate);

    const file = new File([], 'x');
    const first = manager.upload({ id: 'same', channelCid: TEST_CID, file });
    const second = manager.upload({ id: 'same', channelCid: TEST_CID, file });

    expect(first).toBe(second);
    expect(doUploadRequest).toHaveBeenCalledTimes(1);

    resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });

  it('different ids allow concurrent uploads', async () => {
    const { manager, doUploadRequest } = createManager();
    let resolveA!: () => void;
    let resolveB!: () => void;
    const gateA = new Promise<void>((r) => {
      resolveA = r;
    });
    const gateB = new Promise<void>((r) => {
      resolveB = r;
    });
    const gates = [gateA, gateB];
    let i = 0;
    doUploadRequest.mockImplementation(async () => gates[i++]);

    const file = new File([], 'x');
    const p1 = manager.upload({ id: 'm1', channelCid: TEST_CID, file });
    const p2 = manager.upload({ id: 'm2', channelCid: TEST_CID, file });

    expect(manager.getUpload('m1')?.state).toBe('uploading');
    expect(manager.getUpload('m2')?.state).toBe('uploading');

    const p1Again = manager.upload({ id: 'm1', channelCid: TEST_CID, file });
    expect(p1Again).toBe(p1);
    expect(doUploadRequest).toHaveBeenCalledTimes(2);

    resolveA();
    resolveB();
    await Promise.all([p1, p2]);
  });

  it('on success, transitions to finished', async () => {
    const { manager, doUploadRequest } = createManager();

    const snapshots: unknown[] = [];
    const unsub = manager.state.subscribe((next) => snapshots.push(next.uploads));

    await manager.upload({
      id: 'u1',
      channelCid: TEST_CID,
      file: new File([], 'x'),
    });

    expect(snapshots.some((u: any) => u?.[0]?.state === 'uploading')).toBe(true);
    expect(snapshots.some((u: any) => u?.[0]?.state === 'finished')).toBe(true);

    unsub();
    expect(doUploadRequest).toHaveBeenCalled();
  });

  it('omits onProgress when shouldTrackProgress is false', async () => {
    const { manager, doUploadRequest } = createManager();
    const file = new File([], 'x');
    await manager.upload({
      id: 'u1',
      channelCid: TEST_CID,
      file,
      shouldTrackProgress: false,
    });
    expect(doUploadRequest).toHaveBeenCalledWith(file, undefined);
  });

  describe('deleteUploadRecords', () => {
    it('removes matching records and leaves others', async () => {
      const { manager, doUploadRequest } = createManager();
      const file = new File([], 'x');

      await manager.upload({ id: 'm1', channelCid: TEST_CID, file });
      await manager.upload({ id: 'm2', channelCid: TEST_CID, file });

      expect(manager.getUpload('m1')?.state).toBe('finished');
      expect(manager.getUpload('m2')?.state).toBe('finished');

      manager.deleteUploadRecords((u) => u.id === 'm1');

      expect(manager.getUpload('m1')).toBeUndefined();
      expect(manager.getUpload('m2')?.state).toBe('finished');
      expect(doUploadRequest).toHaveBeenCalledTimes(2);
    });

    it('removes failed records and does not trigger another upload', async () => {
      const err = new Error('fail');
      const { manager, doUploadRequest } = createManager(vi.fn().mockRejectedValue(err));

      await expect(
        manager.upload({ id: 'm1', channelCid: TEST_CID, file: new File([], 'x') }),
      ).rejects.toBe(err);
      expect(manager.getUpload('m1')?.state).toBe('failed');

      manager.deleteUploadRecords((u) => u.id === 'm1');

      expect(manager.getUpload('m1')).toBeUndefined();
      expect(doUploadRequest).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when nothing matches', () => {
      const { manager, doUploadRequest } = createManager(
        vi.fn().mockImplementation(() => new Promise(() => {})),
      );
      void manager.upload({ id: 'm1', channelCid: TEST_CID, file: new File([], 'x') });

      manager.deleteUploadRecords(() => false);

      expect(manager.getUpload('m1')?.state).toBe('uploading');
      expect(doUploadRequest).toHaveBeenCalledTimes(1);
    });
  });
});
