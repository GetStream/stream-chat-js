import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientWithUser } from './test-utils/getClient';

import type { StreamChat } from '../../src/client';

describe('ApiClient request options', () => {
  let client: StreamChat;
  let requestSpy: ReturnType<typeof vi.spyOn>;

  const configOfCall = (index: number) =>
    requestSpy.mock.calls[index][0] as { signal?: AbortSignal };
  const firstConfig = () => configOfCall(0);

  beforeEach(() => {
    client = getClientWithUser();
    requestSpy = vi
      .spyOn(client.axiosInstance, 'request')
      .mockResolvedValue({ data: {}, status: 200, headers: {} });
  });

  const sendRequest = (options?: { signal?: AbortSignal }) =>
    client.api.sendRequest(
      'GET',
      '/api/v2/chat/channels',
      undefined,
      undefined,
      undefined,
      undefined,
      options,
    );

  it('sends no signal when no options are given', async () => {
    await sendRequest();

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(firstConfig().signal).to.be.undefined;
  });

  it('forwards the signal from the request options to axios', async () => {
    const controller = new AbortController();

    await sendRequest({ signal: controller.signal });

    expect(firstConfig().signal).to.equal(controller.signal);
  });

  it('aborts the request when the caller aborts the signal', async () => {
    const controller = new AbortController();

    await sendRequest({ signal: controller.signal });
    const { signal } = firstConfig();

    expect(signal?.aborted).to.be.false;
    controller.abort();
    expect(signal?.aborted).to.be.true;
  });

  it('forwards an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await sendRequest({ signal: controller.signal });

    expect(firstConfig().signal?.aborted).to.be.true;
  });

  it('applies the options to a single request only', async () => {
    const controller = new AbortController();

    await sendRequest({ signal: controller.signal });
    await sendRequest();

    expect(configOfCall(1).signal).to.be.undefined;
  });

  it('keeps the same signal across retries', async () => {
    const controller = new AbortController();
    requestSpy.mockRejectedValueOnce(
      Object.assign(new AxiosError('rate limited'), { status: 429 }),
    );

    await sendRequest({ signal: controller.signal });

    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(configOfCall(1).signal).to.equal(controller.signal);
  });
});
