import { describe, expect, it, vi } from 'vitest';
import type { StreamChat, UploadRecord } from '../../../src';
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

    expect(manager.uploads).toEqual({
      'local-a': {
        id: 'local-a',
        uploadProgress: 0,
      },
    });
    await promise;

    expect(manager.getUpload('local-a')).toBeUndefined();
    expect(doUploadRequest).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        onProgress: expect.any(Function),
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it('stores id on upload record', async () => {
    const { manager, doUploadRequest } = createManager();
    const file = new File([], 'a.txt');

    await manager.upload({ id: 'm1', channelCid: TEST_CID, file });

    const snapshots: unknown[] = [];
    const { manager: manager2, doUploadRequest: doUploadRequest2 } = createManager();
    const unsub = manager2.state.subscribe((next) => snapshots.push({ ...next.uploads }));
    await manager2.upload({
      id: 'm1',
      channelCid: TEST_CID,
      file: new File([], 'b.txt'),
    });
    unsub();

    expect(
      snapshots.some((u: unknown) => {
        const row = (u as Record<string, UploadRecord>)['m1'];
        return row?.id === 'm1' && row.uploadProgress === 0;
      }),
    ).toBe(true);
    expect(
      snapshots.some(
        (u: unknown) => Object.keys(u as Record<string, UploadRecord>).length === 0,
      ),
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

  it('on failure, removes record and rejects the promise', async () => {
    const err = new Error('boom');
    const { manager, doUploadRequest } = createManager(vi.fn().mockRejectedValue(err));

    await expect(
      manager.upload({
        id: 'u1',
        channelCid: TEST_CID,
        file: new File([], 'x'),
      }),
    ).rejects.toBe(err);

    expect(manager.getUpload('u1')).toBeUndefined();
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

    expect(manager.uploads).toEqual({});
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

    expect(manager.getUpload('m1')).toEqual({ id: 'm1', uploadProgress: 0 });
    expect(manager.getUpload('m2')).toEqual({ id: 'm2', uploadProgress: 0 });

    const p1Again = manager.upload({ id: 'm1', channelCid: TEST_CID, file });
    expect(p1Again).toBe(p1);
    expect(doUploadRequest).toHaveBeenCalledTimes(2);

    resolveA();
    resolveB();
    await Promise.all([p1, p2]);
  });

  it('on success, response is returned and upload record is removed', async () => {
    const response = { file: 'https://cdn.example/uploaded' };
    const { manager, doUploadRequest } = createManager(
      vi.fn().mockResolvedValue(response),
    );

    const result = await manager.upload({
      id: 'u1',
      channelCid: TEST_CID,
      file: new File([], 'x'),
    });

    expect(result).toBe(response);
    expect(manager.getUpload('u1')).toBeUndefined();
    expect(doUploadRequest).toHaveBeenCalled();
  });

  it('passes abortSignal without onProgress when trackUploadProgress is false', async () => {
    const { manager, doUploadRequest } = createManager(
      vi.fn().mockResolvedValue(undefined),
      false,
    );
    const file = new File([], 'x');
    await manager.upload({
      id: 'u1',
      channelCid: TEST_CID,
      file,
    });
    expect(doUploadRequest).toHaveBeenCalledWith(file, {
      abortSignal: expect.any(AbortSignal),
    });
  });

  describe('deleteUploadRecord', () => {
    it('removes matching in-flight record and leaves others', async () => {
      const { manager, doUploadRequest } = createManager(
        vi.fn().mockImplementation(() => new Promise(() => {})),
      );
      const file = new File([], 'x');

      void manager.upload({ id: 'm1', channelCid: TEST_CID, file });
      void manager.upload({ id: 'm2', channelCid: TEST_CID, file });

      await Promise.resolve();

      expect(manager.getUpload('m1')).toBeDefined();
      expect(manager.getUpload('m2')).toBeDefined();

      manager.deleteUploadRecord('m1');

      expect(manager.getUpload('m1')).toBeUndefined();
      expect(manager.getUpload('m2')).toBeDefined();
      expect(doUploadRequest).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when id does not match any record', () => {
      const { manager, doUploadRequest } = createManager(
        vi.fn().mockImplementation(() => new Promise(() => {})),
      );
      void manager.upload({ id: 'm1', channelCid: TEST_CID, file: new File([], 'x') });

      manager.deleteUploadRecord('other');

      expect(manager.getUpload('m1')).toEqual({ id: 'm1', uploadProgress: 0 });
      expect(doUploadRequest).toHaveBeenCalledTimes(1);
    });

    it('aborts abortSignal when deleteUploadRecord is called during upload', async () => {
      let capturedSignal: AbortSignal | undefined;
      const { manager, doUploadRequest } = createManager(
        vi
          .fn()
          .mockImplementation((_file: unknown, opts?: { abortSignal?: AbortSignal }) => {
            capturedSignal = opts?.abortSignal;
            return new Promise(() => {});
          }),
      );

      void manager.upload({ id: 'm1', channelCid: TEST_CID, file: new File([], 'x') });
      await Promise.resolve();
      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(false);

      manager.deleteUploadRecord('m1');
      expect(capturedSignal?.aborted).toBe(true);
      expect(doUploadRequest).toHaveBeenCalledTimes(1);
    });

    it('aborts all in-flight abortSignals when reset is called', async () => {
      const signals: AbortSignal[] = [];
      const { manager, doUploadRequest } = createManager(
        vi
          .fn()
          .mockImplementation((_file: unknown, opts?: { abortSignal?: AbortSignal }) => {
            if (opts?.abortSignal) signals.push(opts.abortSignal);
            return new Promise(() => {});
          }),
      );

      void manager.upload({ id: 'a', channelCid: TEST_CID, file: new File([], 'x') });
      void manager.upload({ id: 'b', channelCid: TEST_CID, file: new File([], 'y') });
      await Promise.resolve();
      expect(signals).toHaveLength(2);
      expect(signals.every((s) => !s.aborted)).toBe(true);

      manager.reset();
      expect(signals.every((s) => s.aborted)).toBe(true);
      expect(manager.uploads).toEqual({});
      expect(doUploadRequest).toHaveBeenCalledTimes(2);
    });

    it('rejects upload promise after delete when doUploadRequest honors abortSignal', async () => {
      const { manager, doUploadRequest } = createManager(
        vi
          .fn()
          .mockImplementation((_file: unknown, opts?: { abortSignal?: AbortSignal }) => {
            const { abortSignal } = opts ?? {};
            return new Promise((resolve, reject) => {
              if (!abortSignal) {
                reject(new Error('missing signal'));
                return;
              }
              if (abortSignal.aborted) {
                reject(new DOMException('The user aborted a request.', 'AbortError'));
                return;
              }
              abortSignal.addEventListener(
                'abort',
                () =>
                  reject(new DOMException('The user aborted a request.', 'AbortError')),
                { once: true },
              );
            });
          }),
      );

      const uploadPromise = manager.upload({
        id: 'u-abort',
        channelCid: TEST_CID,
        file: new File([], 'x'),
      });
      await Promise.resolve();

      manager.deleteUploadRecord('u-abort');

      await expect(uploadPromise).rejects.toMatchObject({ name: 'AbortError' });
      expect(doUploadRequest).toHaveBeenCalledTimes(1);
    });

    it('does not re-insert the record when onProgress fires after deleteUploadRecord', async () => {
      let onProgress!: (p?: number) => void;
      const { manager, doUploadRequest } = createManager(
        vi
          .fn()
          .mockImplementation(
            (
              _file: unknown,
              opts?: { onProgress?: (n?: number) => void; abortSignal?: AbortSignal },
            ) => {
              onProgress = opts!.onProgress!;
              return new Promise(() => {});
            },
          ),
      );

      void manager.upload({
        id: 'removed-mid-flight',
        channelCid: TEST_CID,
        file: new File([], 'x'),
      });

      await Promise.resolve();
      expect(manager.getUpload('removed-mid-flight')).toBeDefined();

      manager.deleteUploadRecord('removed-mid-flight');
      expect(manager.getUpload('removed-mid-flight')).toBeUndefined();

      onProgress(50);
      expect(manager.getUpload('removed-mid-flight')).toBeUndefined();
      expect(doUploadRequest).toHaveBeenCalledTimes(1);
    });
  });
});
