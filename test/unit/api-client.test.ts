import type { AxiosRequestConfig } from 'axios';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientWithUser } from './test-utils/getClient';

import type { StreamChat } from '../../src/client';
import type { StreamRequestOptions } from '../../src/types';

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

  // An offline-db task payload carries the method's `requestOptions`, so a task that was
  // persisted and replayed after a restart arrives with a JSON-revived signal: an inert `{}`.
  // Axios reaches for `signal.addEventListener` unconditionally, so it must not get through.
  it('drops a signal that did not survive JSON persistence', async () => {
    const revived = JSON.parse(
      JSON.stringify({ signal: new AbortController().signal }),
    ) as { signal: AbortSignal };

    expect(revived.signal.addEventListener).to.be.undefined;

    await sendRequest(revived);

    expect(firstConfig().signal).to.be.undefined;
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

  it('forwards onUploadProgress from the request options to axios', async () => {
    const onUploadProgress = vi.fn();

    await sendRequest({ onUploadProgress } as StreamRequestOptions);

    expect((firstConfig() as { onUploadProgress?: unknown }).onUploadProgress).to.equal(
      onUploadProgress,
    );
  });

  // Same reasoning as the revived-signal case above: a persisted offline-db task payload
  // loses its functions.
  it('drops an onUploadProgress that did not survive JSON persistence', async () => {
    const revived = JSON.parse(JSON.stringify({ onUploadProgress: () => {} }));

    await sendRequest(revived);

    expect((firstConfig() as { onUploadProgress?: unknown }).onUploadProgress).to.be
      .undefined;
  });
});

describe('ApiClient header precedence', () => {
  let client: StreamChat;
  let requestSpy: ReturnType<typeof vi.spyOn>;

  const sentHeaders = () =>
    (requestSpy.mock.calls[0][0] as AxiosRequestConfig).headers as Record<
      string,
      unknown
    >;

  beforeEach(() => {
    client = getClientWithUser();
    client.options.axiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'integrator-token',
        'x-stream-client': 'integrator-agent',
        'x-custom': 'kept',
      },
    };
    requestSpy = vi
      .spyOn(client.axiosInstance, 'request')
      .mockResolvedValue({ data: {}, status: 200, headers: {} });
  });

  it('lets a per-request Content-Type outrank the integrator global one', async () => {
    await client.api.sendRequest(
      'POST',
      '/api/v2/uploads/file',
      undefined,
      undefined,
      { file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }) },
      'multipart/form-data',
    );

    expect(sentHeaders()['Content-Type']).to.equal('multipart/form-data');
  });

  it('keeps SDK-owned headers out of the integrator global reach', async () => {
    await client.api.sendRequest('GET', '/api/v2/chat/channels');

    expect(sentHeaders().Authorization).to.not.equal('integrator-token');
    expect(sentHeaders()['x-stream-client']).to.not.equal('integrator-agent');
  });

  it('still applies integrator headers the SDK does not set itself', async () => {
    await client.api.sendRequest('GET', '/api/v2/chat/channels');

    expect(sentHeaders()['x-custom']).to.equal('kept');
  });

  // `client._sayHi()` (src/client.ts:1206) threads its own id through doAxiosRequest.
  it('honours a caller-supplied x-client-request-id', async () => {
    await client.api.doAxiosRequest('get', `${client.baseURL}/hi`, null, {
      headers: { 'x-client-request-id': 'my-id' },
    });

    expect(sentHeaders()['x-client-request-id']).to.equal('my-id');
  });
});

describe('ApiClient multipart encoding', () => {
  let client: StreamChat;
  let requestSpy: ReturnType<typeof vi.spyOn>;

  const firstConfig = () =>
    requestSpy.mock.calls[0][0] as AxiosRequestConfig & {
      headers?: Record<string, unknown>;
    };
  const sentForm = () => firstConfig().data as FormData;

  beforeEach(() => {
    client = getClientWithUser();
    requestSpy = vi
      .spyOn(client.axiosInstance, 'request')
      .mockResolvedValue({ data: {}, status: 200, headers: {} });
  });

  const sendMultipart = (body: Record<string, unknown>) =>
    client.api.sendRequest(
      'POST',
      '/api/v2/uploads/file',
      undefined,
      undefined,
      body,
      'multipart/form-data',
    );

  it('encodes a multipart body as FormData', async () => {
    await sendMultipart({ file: new File(['x'], 'a.txt', { type: 'text/plain' }) });

    expect(sentForm()).to.be.instanceOf(FormData);
  });

  it('leaves a non-multipart body untouched and keeps its content type', async () => {
    const body = { text: 'hi' };

    await client.api.sendRequest(
      'POST',
      '/api/v2/chat/channels',
      undefined,
      undefined,
      body,
      'application/json',
    );

    expect(firstConfig().data).to.equal(body);
    expect(firstConfig().headers?.['Content-Type']).to.equal('application/json');
  });

  it('appends a File under its own name', async () => {
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });

    await sendMultipart({ file });

    const appended = sentForm().get('file') as File;
    expect(appended).to.be.instanceOf(File);
    expect(appended.name).to.equal('a.txt');
  });

  // React Native has no Blob with a real body behind a picker URI - its FormData reads `uri`,
  // `name` and `type` off the appended object, so those keys must survive verbatim. Node's
  // spec-compliant FormData stringifies a non-Blob value, so the descriptor has to be read
  // off the `append` call rather than back out of the form.
  it('appends a React Native file descriptor as-is', async () => {
    const append = vi.spyOn(FormData.prototype, 'append');

    await sendMultipart({
      file: { uri: 'file:///tmp/photo.heic', name: 'photo.heic', type: 'image/heic' },
    });

    expect(append).toHaveBeenCalledWith('file', {
      uri: 'file:///tmp/photo.heic',
      name: 'photo.heic',
      type: 'image/heic',
      contentType: 'image/heic',
    });
  });

  it('derives a descriptor file name from the URI when none is given', async () => {
    const append = vi.spyOn(FormData.prototype, 'append');

    await sendMultipart({ file: { uri: 'file:///tmp/nested/photo.heic' } });

    expect(append).toHaveBeenCalledWith(
      'file',
      expect.objectContaining({ name: 'photo.heic' }),
    );
  });

  // The API wants these JSON-encoded. Axios' own `toFormData` would emit `user[id]` and
  // `upload_sizes[0][height]` instead.
  it('JSON-encodes object and array fields', async () => {
    await sendMultipart({
      file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      user: { id: 'jane' },
      upload_sizes: [{ height: 100, width: 100 }],
    });

    expect(sentForm().get('user')).to.equal('{"id":"jane"}');
    expect(sentForm().get('upload_sizes')).to.equal('[{"height":100,"width":100}]');
  });

  it('omits null and undefined fields entirely', async () => {
    await sendMultipart({
      file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
      user: undefined,
      upload_sizes: null,
    });

    expect(sentForm().has('user')).to.be.false;
    expect(sentForm().has('upload_sizes')).to.be.false;
  });

  // Declared without a boundary on purpose - every axios adapter rewrites the header for a
  // FormData body (node substitutes the boundary it generated, browser/fetch/RN clear it so the
  // platform does).
  it('declares the multipart Content-Type and leaves the boundary to the adapter', async () => {
    await sendMultipart({ file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }) });

    expect(firstConfig().headers?.['Content-Type']).to.equal('multipart/form-data');
  });

  // This request's multipart Content-Type must outrank an integrator's global one. If that
  // precedence is ever reversed, axios' default transformRequest turns the form into
  // `JSON.stringify(formDataToJSON(form))` - the file disappears and the request still returns
  // 2xx, so assert on the resolved header rather than on the eventual body.
  it('keeps the multipart Content-Type over a client-level application/json', async () => {
    client.options.axiosRequestConfig = {
      headers: { 'Content-Type': 'application/json' },
    };

    await sendMultipart({ file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }) });

    expect(firstConfig().data).to.be.instanceOf(FormData);
    expect(firstConfig().headers?.['Content-Type']).to.equal('multipart/form-data');
  });

  // The axios instance defaults to a 3s timeout, which would kill any sizeable upload.
  it('disables the timeout and size caps for multipart requests', async () => {
    await sendMultipart({ file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }) });

    expect(firstConfig().timeout).to.equal(0);
    expect(firstConfig().maxContentLength).to.equal(Infinity);
    expect(firstConfig().maxBodyLength).to.equal(Infinity);
  });

  it('does not apply the upload defaults to a non-multipart request', async () => {
    await client.api.sendRequest('GET', '/api/v2/chat/channels');

    expect(firstConfig().timeout).to.be.undefined;
    expect(firstConfig().maxContentLength).to.be.undefined;
    expect(firstConfig().maxBodyLength).to.be.undefined;
  });

  it('keeps a caller signal alongside the upload defaults', async () => {
    const controller = new AbortController();

    await client.api.sendRequest(
      'POST',
      '/api/v2/uploads/file',
      undefined,
      undefined,
      { file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }) },
      'multipart/form-data',
      { signal: controller.signal },
    );

    expect(firstConfig().signal).to.equal(controller.signal);
    expect(firstConfig().timeout).to.equal(0);
  });
});

describe('upload methods', () => {
  let client: StreamChat;
  let requestSpy: ReturnType<typeof vi.spyOn>;

  const firstConfig = () =>
    requestSpy.mock.calls[0][0] as AxiosRequestConfig & { data?: FormData };

  beforeEach(() => {
    client = getClientWithUser();
    requestSpy = vi
      .spyOn(client.axiosInstance, 'request')
      .mockResolvedValue({ data: {}, status: 200, headers: {} });
  });

  const file = () => new File(['x'], 'a.jpg', { type: 'image/jpeg' });

  it('posts client uploads to the generated routes', async () => {
    await client.uploadFile({ file: file() });
    expect(firstConfig().url).to.equal(`${client.baseURL}/api/v2/uploads/file`);

    requestSpy.mockClear();
    await client.uploadImage({ file: file() });
    expect(firstConfig().url).to.equal(`${client.baseURL}/api/v2/uploads/image`);
  });

  it('posts channel uploads to the generated routes', async () => {
    const channel = client.channel('messaging', 'chan-id');

    await channel.uploadChannelFile({ file: file() });
    expect(firstConfig().url).to.equal(
      `${client.baseURL}/api/v2/chat/channels/messaging/chan-id/file`,
    );

    requestSpy.mockClear();
    await channel.uploadChannelImage({ file: file() });
    expect(firstConfig().url).to.equal(
      `${client.baseURL}/api/v2/chat/channels/messaging/chan-id/image`,
    );
  });

  it('exposes uploadFile / uploadImage aliases on the channel', async () => {
    const channel = client.channel('messaging', 'chan-id');
    const uploadChannelFile = vi.spyOn(channel, 'uploadChannelFile');
    const payload = { file: file() };

    await channel.uploadFile(payload);

    expect(uploadChannelFile).toHaveBeenCalledWith(payload);
  });

  it('throws when the channel has no id yet', async () => {
    const channel = client.channel('messaging', undefined, { members: ['a', 'b'] });

    await expect(channel.uploadChannelFile({ file: file() })).rejects.toThrow(
      /Channel isn't yet created/,
    );
  });

  it('normalizes a bare URI string into a descriptor', async () => {
    const append = vi.spyOn(FormData.prototype, 'append');

    await client.uploadFile({ file: 'file:///tmp/nested/photo.heic' });

    expect(append).toHaveBeenCalledWith(
      'file',
      expect.objectContaining({
        uri: 'file:///tmp/nested/photo.heic',
        name: 'photo.heic',
      }),
    );
  });

  it('passes upload_sizes through raw so it is JSON-encoded once', async () => {
    await client.uploadImage({
      file: file(),
      upload_sizes: [{ height: 100, width: 100 }],
    });

    expect((firstConfig().data as FormData).get('upload_sizes')).to.equal(
      '[{"height":100,"width":100}]',
    );
  });
});
