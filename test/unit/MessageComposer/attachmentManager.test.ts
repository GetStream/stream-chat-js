import { describe, expect, it, vi } from 'vitest';
import {
  API_MAX_FILES_ALLOWED_PER_MESSAGE,
  DEFAULT_UPLOAD_SIZE_LIMIT_BYTES,
} from '../../../src/constants';
import {
  AttachmentManagerConfig,
  DraftMessage,
  DraftResponse,
  LocalMessage,
  MessageComposer,
  StreamChat,
} from '../../../src';
import { AppSettings, AttachmentManager } from '../../../src';

// Add FileList mock
vi.mock('../../../src/messageComposer/fileUtils', async (importOriginal) => {
  const original: object = await importOriginal();
  return {
    ...original,
    isFileList: vi.fn().mockReturnValue(false), // FileList is Web specific so for now we avoid testing for it
  };
});
vi.mock('../../../src/utils', async (importOriginal) => {
  const original: object = await importOriginal();
  return {
    ...original,
    generateUUIDv4: vi.fn().mockReturnValue('test-uuid'),
    mergeWith: vi.fn().mockImplementation((target, source) => ({ ...target, ...source })),
    randomId: vi.fn().mockReturnValue('test-uuid'),
  };
});

const defaultAppSettings = {
  app: {
    image_upload_config: {
      allowed_file_extensions: ['jpg', 'png'],
      allowed_mime_types: ['image/jpeg', 'image/png'],
      size_limit: DEFAULT_UPLOAD_SIZE_LIMIT_BYTES,
    },
    file_upload_config: {
      allowed_file_extensions: ['pdf', 'doc'],
      allowed_mime_types: ['application/pdf', 'application/msword'],
      size_limit: DEFAULT_UPLOAD_SIZE_LIMIT_BYTES,
    },
  },
};

const setup = ({
  appSettings,
  composition,
  config,
}: {
  appSettings?: Partial<AppSettings>;
  composition?: DraftResponse | LocalMessage;
  config?: Partial<AttachmentManagerConfig>;
} = {}) => {
  // Reset mocks
  vi.clearAllMocks();

  // Setup mocks
  const mockClient = new StreamChat('apiKey', 'apiSecret');
  mockClient.appSettingsPromise = Promise.resolve(
    appSettings ? { app: appSettings } : defaultAppSettings,
  );
  (mockClient.getAppSettings = vi
    .fn()
    .mockResolvedValue(appSettings ? { app: appSettings } : defaultAppSettings)),
    (mockClient.notifications = { addError: vi.fn() });

  mockClient.user = { id: 'user-id', name: 'Test User' };

  const mockChannel = mockClient.channel('channelType', 'channelId');
  mockChannel.getClient = vi.fn().mockReturnValue(mockClient);
  mockChannel.sendFile = vi
    .fn()
    .mockResolvedValue({ file: 'test-file-url', thumb_url: 'thumb_url-file' });
  mockChannel.sendImage = vi
    .fn()
    .mockResolvedValue({ file: 'test-image-url', thumb_url: 'thumb_url-image' });
  mockChannel.data = { own_capabilities: ['upload-file'] };
  const messageComposer = new MessageComposer({
    client: mockClient,
    composition,
    compositionContext: mockChannel,
    config: { attachments: config },
  });
  return { mockClient, mockChannel, messageComposer };
};

describe('AttachmentManager', () => {
  describe('constructor', () => {
    it('should initialize with default config', () => {
      const {
        messageComposer: { attachmentManager },
        mockChannel,
      } = setup();
      expect(attachmentManager.channel).toBe(mockChannel);
      expect(attachmentManager.state.getLatestValue()).toEqual({
        attachments: [],
      });
      const config = attachmentManager.config;
      expect(typeof attachmentManager.config.fileUploadFilter).toBe('function');
      expect(config.maxNumberOfFilesPerMessage).toBe(API_MAX_FILES_ALLOWED_PER_MESSAGE);
    });

    it('should initialize with draft message', () => {
      const message: DraftResponse = {
        message: {
          id: 'test-message-id',
          text: '',
          type: 'regular',
          attachments: [
            {
              type: 'image',
              image_url: 'test-image-url',
            },
          ],
        },
        channel_cid: 'channel-cid',
        created_at: new Date().toISOString(),
      };

      // ts-expect-error mocked channel
      const {
        messageComposer: { attachmentManager },
        mockChannel,
      } = setup({ composition: message });

      expect(attachmentManager.attachments).toEqual([
        {
          type: 'image',
          image_url: 'test-image-url',
          localMetadata: {
            id: 'test-uuid',
            uploadState: 'finished',
          },
        },
      ]);
    });

    it('should initialize with message', () => {
      const message: LocalMessage = {
        id: 'test-message-id',
        text: '',
        type: 'regular',
        created_at: new Date(),
        deleted_at: null,
        pinned_at: null,
        status: 'pending',
        updated_at: new Date(),
        attachments: [
          {
            type: 'image',
            image_url: 'test-image-url',
          },
        ],
      };
      const {
        messageComposer: { attachmentManager },
        mockChannel,
      } = setup({ composition: message });

      expect(attachmentManager.attachments).toEqual([
        {
          type: 'image',
          image_url: 'test-image-url',
          localMetadata: {
            id: 'test-uuid',
            uploadState: 'finished',
          },
        },
      ]);
    });
  });

  describe('getters', () => {
    it('should retrieve attachments config from composer', () => {
      const config: AttachmentManagerConfig = {
        doUploadRequest: () => {
          return Promise.resolve({ file: 'x' });
        },
        fileUploadFilter: () => false,
        maxNumberOfFilesPerMessage: 3000,
      };
      const {
        messageComposer: { attachmentManager },
      } = setup({ config });
      expect(attachmentManager.config).toEqual(config);
    });

    it('should return the correct values from state', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();

      // Create a test file and upload it to populate the state
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      attachmentManager.state.next({
        attachments: [
          {
            type: 'image',
            image_url: 'test-image-url',
            localMetadata: {
              id: 'test-uuid',
              uploadState: 'finished',
              file,
            },
          },
        ],
      });
      // Now check the getters
      expect(attachmentManager.attachments.length).toBe(1);
      expect(attachmentManager.hasUploadPermission).toBe(true);
      expect(attachmentManager.isUploadEnabled).toBe(true);
    });

    it('should return false for isUploadEnabled when uploads are disabled', () => {
      const {
        messageComposer: { attachmentManager },
        mockChannel,
      } = setup();
      mockChannel.data = { ...mockChannel.data, own_capabilities: [] };
      // isUploadEnabled should be false when the channel doesn't have upload-file capability
      expect(attachmentManager.isUploadEnabled).toBe(false);
      // hasUploadPermission should also be false
      expect(attachmentManager.hasUploadPermission).toBe(false);
    });

    it('should return false for isUploadEnabled when no upload slots are available', () => {
      // Create a message with maximum number of attachments
      const composition: DraftResponse = {
        message: {
          id: 'test-message-id',
          text: '',
          attachments: Array(API_MAX_FILES_ALLOWED_PER_MESSAGE).fill({
            type: 'image',
            image_url: 'test-image-url',
          }),
        },
        channel_cid: 'channel-cid',
        created_at: new Date().toISOString(),
      };

      // Initialize with message containing maximum attachments
      const {
        messageComposer: { attachmentManager },
      } = setup({ composition });

      // Should have 0 slots available
      expect(attachmentManager.availableUploadSlots).toBe(0);

      // isUploadEnabled should be false when no slots are available
      expect(attachmentManager.isUploadEnabled).toBe(false);
    });

    it('should return correct upload counts', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();

      // Create test files with different states
      const file1 = new File([''], 'test1.jpg', { type: 'image/jpeg' });
      const file2 = new File([''], 'test2.jpg', { type: 'image/jpeg' });
      const file3 = new File([''], 'test3.jpg', { type: 'image/jpeg' });
      const file4 = new File([''], 'test4.jpg', { type: 'image/jpeg' });
      const file5 = new File([''], 'test5.jpg', { type: 'image/jpeg' });

      attachmentManager.state.next({
        attachments: [
          {
            type: 'image',
            image_url: 'test-image-url',
            localMetadata: {
              id: 'test-uuid',
              uploadState: 'finished',
              file: file1,
            },
          },
          {
            type: 'image',
            image_url: 'test-image-url',
            localMetadata: {
              id: 'test-uuid',
              uploadState: 'uploading',
              file: file2,
            },
          },
          {
            type: 'image',
            image_url: 'test-image-url',
            localMetadata: {
              id: 'test-uuid',
              uploadState: 'failed',
              file: file3,
            },
          },
          {
            type: 'image',
            image_url: 'test-image-url',
            localMetadata: {
              id: 'test-uuid',
              uploadState: 'blocked',
              file: file4,
            },
          },
          {
            type: 'image',
            image_url: 'test-image-url',
            localMetadata: {
              id: 'test-uuid',
              uploadState: 'pending',
              file: file5,
            },
          },
        ],
      });
      // Check the upload counts
      expect(attachmentManager.successfulUploadsCount).toBeGreaterThanOrEqual(1);
      expect(attachmentManager.uploadsInProgressCount).toBeGreaterThanOrEqual(1);
      expect(attachmentManager.failedUploadsCount).toBeGreaterThanOrEqual(1);
      expect(attachmentManager.blockedUploadsCount).toBeGreaterThanOrEqual(1);
      expect(attachmentManager.pendingUploadsCount).toBeGreaterThanOrEqual(1);
    });

    it('should return correct available upload slots', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();

      // Initially should have max slots available
      expect(attachmentManager.availableUploadSlots).toBe(
        API_MAX_FILES_ALLOWED_PER_MESSAGE,
      );

      // Create and upload a file to reduce available slots
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      attachmentManager.state.next({
        attachments: [
          {
            type: 'image',
            image_url: 'test-image-url',
            localMetadata: {
              id: 'test-uuid',
              uploadState: 'finished',
              file,
            },
          },
        ],
      });
      // Should have one less slot available
      expect(attachmentManager.availableUploadSlots).toBe(
        API_MAX_FILES_ALLOWED_PER_MESSAGE - 1,
      );
    });

    it('should calculate available upload slots based on message attachments', () => {
      // Create a message with 2 attachments
      const composition: DraftResponse = {
        message: {
          id: 'test-message-id',
          text: '',
          attachments: [
            { type: 'image', image_url: 'test-image-url-1' },
            { type: 'image', image_url: 'test-image-url-2' },
          ],
        },
        channel_cid: 'channel-cid',
        created_at: new Date().toISOString(),
      };

      // Initialize with message containing attachments
      const {
        messageComposer: { attachmentManager },
      } = setup({ composition });

      // Should have max slots minus the number of attachments in the message
      expect(attachmentManager.availableUploadSlots).toBe(
        API_MAX_FILES_ALLOWED_PER_MESSAGE - 2,
      );
    });

    it('should take into consideration uploads in progress', () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();

      // Set up state with successful uploads and uploads in progress
      attachmentManager.state.next({
        attachments: [
          {
            type: 'image',
            image_url: 'test-image-url',
            localMetadata: {
              id: 'test-uuid-1',
              uploadState: 'finished',
              file: new File([''], 'test1.jpg', { type: 'image/jpeg' }),
            },
          },
          {
            type: 'image',
            image_url: 'test-image-url',
            localMetadata: {
              id: 'test-uuid-2',
              uploadState: 'uploading',
              file: new File([''], 'test2.jpg', { type: 'image/jpeg' }),
            },
          },
        ],
      });

      // Should have max slots minus successful uploads (1) minus uploads in progress (1)
      expect(attachmentManager.availableUploadSlots).toBe(
        API_MAX_FILES_ALLOWED_PER_MESSAGE - 2,
      );
    });
  });

  describe('initState', () => {
    it('should reset the state to initial state', () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();

      attachmentManager.initState();

      expect(attachmentManager.state.getLatestValue()).toEqual({ attachments: [] });
    });

    it('should initialize with message', () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();
      const message = {
        attachments: [{ type: 'image', image_url: 'test-url' }],
      };

      attachmentManager.initState({ message });

      expect(attachmentManager.state.getLatestValue()).toEqual({
        attachments: [
          {
            image_url: 'test-url',
            localMetadata: {
              id: 'test-uuid',
              uploadState: 'finished',
            },
            type: 'image',
          },
        ],
      });
    });
  });

  describe('getAttachmentIndex', () => {
    it('should return the correct index for an attachment', () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();

      attachmentManager.state.next({
        attachments: [
          { localMetadata: { id: 'test-id-1' } },
          { localMetadata: { id: 'test-id-2' } },
        ],
      });

      expect(attachmentManager.getAttachmentIndex('test-id-1')).toBe(0);
      expect(attachmentManager.getAttachmentIndex('test-id-2')).toBe(1);
      expect(attachmentManager.getAttachmentIndex('non-existent')).toBe(-1);
    });
  });

  describe('upsertAttachments', () => {
    it('should add new attachments', () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();

      const newAttachments = [
        { localMetadata: { id: 'test-id-1' } },
        { localMetadata: { id: 'test-id-2' } },
      ];

      attachmentManager.upsertAttachments(newAttachments);

      expect(attachmentManager.attachments).toEqual(newAttachments);
    });

    it('should update existing attachments', () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();
      attachmentManager.upsertAttachments([
        { localMetadata: { id: 'test-id-1' }, type: 'image' },
      ]);

      const updatedAttachments = [{ localMetadata: { id: 'test-id-1' }, type: 'video' }];

      attachmentManager.upsertAttachments(updatedAttachments);

      expect(attachmentManager.attachments).toEqual(updatedAttachments);
    });
  });

  describe('removeAttachments', () => {
    it('should remove attachments by id', () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();
      const newAttachments = [
        { localMetadata: { id: 'test-id-1' } },
        { localMetadata: { id: 'test-id-2' } },
      ];

      attachmentManager.upsertAttachments(newAttachments);

      attachmentManager.removeAttachments(['test-id-1']);

      expect(attachmentManager.attachments).toEqual([
        { localMetadata: { id: 'test-id-2' } },
      ]);
    });
  });

  describe('getUploadConfigCheck', () => {
    it('should block files with disallowed extensions', async () => {
      const file = new File([''], 'test.gif', { type: 'image/gif' });
      const {
        messageComposer: { attachmentManager },
      } = setup();
      const result = await attachmentManager.getUploadConfigCheck(file);
      expect(result).toEqual({
        uploadBlocked: true,
        reason: 'allowed_file_extensions',
      });
    });

    it('should block files with blocked extensions', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup({
        appSettings: {
          ...defaultAppSettings.app,
          image_upload_config: {
            ...defaultAppSettings.app.image_upload_config,
            allowed_file_extensions: ['jpg', 'png', 'gif'],
            allowed_mime_types: ['image/jpeg', 'image/png', 'image/gif'],
            blocked_file_extensions: ['gif'],
          },
        },
      });

      const file = new File([''], 'test.gif', { type: 'image/gif' });
      const result = await attachmentManager.getUploadConfigCheck(file);
      expect(result).toEqual({
        uploadBlocked: true,
        reason: 'blocked_file_extensions',
      });
    });

    it('should block files with disallowed mime types', async () => {
      const file = new File([''], 'test.jpg', { type: 'image/gif' });
      const {
        messageComposer: { attachmentManager },
      } = setup();
      const result = await attachmentManager.getUploadConfigCheck(file);
      expect(result).toEqual({
        uploadBlocked: true,
        reason: 'allowed_mime_types',
      });
    });

    it('should block files with blocked mime types', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup({
        appSettings: {
          ...defaultAppSettings.app,
          image_upload_config: {
            ...defaultAppSettings.app.image_upload_config,
            allowed_file_extensions: ['jpg', 'png', 'gif'],
            allowed_mime_types: ['image/jpeg', 'image/png', 'image/gif'],
            blocked_mime_types: ['image/gif'],
          },
        },
      });

      const file = new File([''], 'test.jpg', { type: 'image/gif' });
      const result = await attachmentManager.getUploadConfigCheck(file);
      expect(result).toEqual({
        uploadBlocked: true,
        reason: 'blocked_mime_types',
      });
    });

    it('should block files that exceed size limit', async () => {
      const smallSizeLimit = 1000;
      const {
        messageComposer: { attachmentManager },
      } = setup({
        appSettings: {
          ...defaultAppSettings.app,
          image_upload_config: {
            ...defaultAppSettings.app.image_upload_config,
            size_limit: smallSizeLimit,
          },
          file_upload_config: {
            ...defaultAppSettings.app.file_upload_config,
            size_limit: smallSizeLimit,
          },
        },
      });

      const largeContent = new ArrayBuffer(2000);
      const file = new File([largeContent], 'test.jpg', { type: 'image/jpeg' });
      const result = await attachmentManager.getUploadConfigCheck(file);
      expect(result).toEqual({
        uploadBlocked: true,
        reason: 'size_limit',
      });
    });

    it('should block non-image files with disallowed extensions', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup({
        appSettings: {
          ...defaultAppSettings.app,
          file_upload_config: {
            allowed_file_extensions: ['txt'],
            allowed_mime_types: ['text/plain'],
            size_limit: DEFAULT_UPLOAD_SIZE_LIMIT_BYTES,
          },
        },
      });

      const file = new File([''], 'test.exe', { type: 'text/plain' });
      const result = await attachmentManager.getUploadConfigCheck(file);
      expect(result).toEqual({
        uploadBlocked: true,
        reason: 'allowed_file_extensions',
      });
    });

    it('should block non-image files with blocked extensions', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup({
        appSettings: {
          ...defaultAppSettings.app,
          file_upload_config: {
            allowed_file_extensions: ['txt', 'exe'],
            allowed_mime_types: ['text/plain', 'application/x-msdownload'],
            size_limit: DEFAULT_UPLOAD_SIZE_LIMIT_BYTES,
            blocked_file_extensions: ['exe'],
          },
        },
      });

      const file = new File([''], 'test.exe', { type: 'text/plain' });
      const result = await attachmentManager.getUploadConfigCheck(file);
      expect(result).toEqual({
        uploadBlocked: true,
        reason: 'blocked_file_extensions',
      });
    });

    it('should block non-image files with disallowed mime types', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup({
        appSettings: {
          ...defaultAppSettings.app,
          file_upload_config: {
            allowed_file_extensions: ['txt'],
            allowed_mime_types: ['text/plain'],
            size_limit: DEFAULT_UPLOAD_SIZE_LIMIT_BYTES,
          },
        },
      });

      const file = new File([''], 'test.txt', { type: 'application/x-msdownload' });
      const result = await attachmentManager.getUploadConfigCheck(file);
      expect(result).toEqual({
        uploadBlocked: true,
        reason: 'allowed_mime_types',
      });
    });

    it('should block non-image files with blocked mime types', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup({
        appSettings: {
          ...defaultAppSettings.app,
          file_upload_config: {
            allowed_file_extensions: ['txt'],
            allowed_mime_types: ['text/plain', 'application/x-msdownload'],
            size_limit: DEFAULT_UPLOAD_SIZE_LIMIT_BYTES,
            blocked_mime_types: ['application/x-msdownload'],
          },
        },
      });

      const file = new File([''], 'test.txt', { type: 'application/x-msdownload' });
      const result = await attachmentManager.getUploadConfigCheck(file);
      expect(result).toEqual({
        uploadBlocked: true,
        reason: 'blocked_mime_types',
      });
    });

    it('should block non-image files that exceed size limit', async () => {
      const smallSizeLimit = 1000;
      const {
        messageComposer: { attachmentManager },
      } = setup({
        appSettings: {
          ...defaultAppSettings.app,
          file_upload_config: {
            allowed_file_extensions: ['txt'],
            allowed_mime_types: ['text/plain'],
            size_limit: smallSizeLimit,
          },
        },
      });

      const largeContent = new ArrayBuffer(2000);
      const file = new File([largeContent], 'test.txt', { type: 'text/plain' });
      const result = await attachmentManager.getUploadConfigCheck(file);
      expect(result).toEqual({
        uploadBlocked: true,
        reason: 'size_limit',
      });
    });

    it('should handle case when upload config is missing', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup({ appSettings: {} });
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const result = await attachmentManager.getUploadConfigCheck(file);
      expect(result).toEqual({ uploadBlocked: false });
    });

    it('should handle case when only some config options are provided', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup({
        appSettings: {
          image_upload_config: {
            allowed_file_extensions: ['jpg', 'png'],
            size_limit: DEFAULT_UPLOAD_SIZE_LIMIT_BYTES,
            blocked_file_extensions: ['gif'],
          },
          file_upload_config: {
            allowed_file_extensions: ['pdf', 'doc'],
            size_limit: DEFAULT_UPLOAD_SIZE_LIMIT_BYTES,
          },
        },
      });

      const blockedFile = new File([''], 'test.gif', { type: 'image/gif' });
      const blockedResult = await attachmentManager.getUploadConfigCheck(blockedFile);
      expect(blockedResult).toEqual({
        uploadBlocked: true,
        reason: 'allowed_file_extensions',
      });

      // Test with a file that should be allowed by extension but blocked by mime type
      // This should pass because allowed_mime_types is missing
      const allowedFile = new File([''], 'test.jpg', { type: 'image/gif' });
      const allowedResult = await attachmentManager.getUploadConfigCheck(allowedFile);
      expect(allowedResult).toEqual({ uploadBlocked: false });
    });

    it('should handle edge cases', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();
      // Test file with no extension
      const noExtFile = new File([''], 'test', { type: 'image/jpeg' });
      const noExtResult = await attachmentManager.getUploadConfigCheck(noExtFile);
      expect(noExtResult).toEqual({
        uploadBlocked: true,
        reason: 'allowed_file_extensions',
      });

      // Test file with no mime type - evaluated as a non-image file
      const noMimeFile = new File([''], 'test.jpg', { type: '' });
      const noMimeResult = await attachmentManager.getUploadConfigCheck(noMimeFile);
      expect(noMimeResult).toEqual({
        uploadBlocked: true,
        reason: 'allowed_file_extensions',
      });

      // Test file with no size
      const blob = new Blob([''], { type: 'image/jpeg' });
      const getUploadConfigCheck = (attachmentManager as any).getUploadConfigCheck;
      const noSizeResult = await getUploadConfigCheck(blob);
      expect(noSizeResult).toEqual({ uploadBlocked: false });
    });
  });

  describe('uploadFiles', () => {
    it('should upload files successfully', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

      await attachmentManager.uploadFiles([file]);

      expect(attachmentManager.successfulUploadsCount).toBe(1);
    });

    it('should handle upload failures', async () => {
      const {
        messageComposer: { attachmentManager },
        mockChannel,
        mockClient,
      } = setup();
      mockChannel.sendImage.mockRejectedValueOnce(new Error('Upload failed'));
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

      await expect(attachmentManager.uploadFiles([file])).resolves.toEqual([
        {
          fallback: 'test.jpg',
          file_size: 0,
          localMetadata: {
            id: 'test-uuid',
            file,
            uploadState: 'failed',
            previewUri: expect.any(String),
            uploadPermissionCheck: {
              uploadBlocked: false,
            },
          },
          mime_type: 'image/jpeg',
          type: 'image',
        },
      ]);

      expect(attachmentManager.failedUploadsCount).toBe(1);
      expect(mockClient.notifications.addError).toHaveBeenCalledWith({
        message: 'Upload failed',
        origin: {
          emitter: 'AttachmentManager',
          context: { attachment: expect.any(Object) },
        },
      });
    });

    it('should register notification for blocked file', async () => {
      const {
        messageComposer: { attachmentManager },
        mockClient,
      } = setup();

      // Create a blocked attachment
      const blockedAttachment = {
        type: 'image',
        localMetadata: {
          id: 'test-id',
          file: new File([''], 'test.jpg', { type: 'image/jpeg' }),
        },
      };

      // Mock getUploadConfigCheck to return blocked
      vi.spyOn(attachmentManager, 'getUploadConfigCheck').mockResolvedValue({
        uploadBlocked: true,
        reason: 'size_limit',
      });

      await attachmentManager.uploadAttachment(blockedAttachment);

      // Verify notification was added
      expect(mockClient.notifications.addError).toHaveBeenCalledWith({
        message: 'Error uploading attachment',
        origin: {
          emitter: 'AttachmentManager',
          context: { attachment: blockedAttachment },
        },
      });
    });

    it('should use custom upload function when provided', async () => {
      const {
        messageComposer: { attachmentManager },
        mockChannel,
      } = setup();

      // Create a custom upload function
      const customUploadFn = vi.fn().mockResolvedValue({ file: 'custom-upload-url' });

      // Set the custom upload function
      attachmentManager.setCustomUploadFn(customUploadFn);

      // Create a file to upload
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

      // Mock fileToLocalUploadAttachment to return a valid attachment
      const attachment = {
        type: 'image',
        localMetadata: {
          id: 'test-id',
          file,
          uploadState: 'pending',
        },
      };

      vi.spyOn(attachmentManager, 'ensureLocalUploadAttachment').mockResolvedValue(
        attachment,
      );

      // Upload the attachment
      await attachmentManager.uploadAttachment(attachment);

      // Verify the custom upload function was called
      expect(customUploadFn).toHaveBeenCalledWith(file);
      expect(mockChannel.sendImage).not.toHaveBeenCalled();
    });

    it('should respect maxNumberOfFilesPerMessage', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();
      const files = Array(API_MAX_FILES_ALLOWED_PER_MESSAGE + 1)
        .fill(null)
        .map(() => new File([''], 'test.jpg', { type: 'image/jpeg' }));

      await attachmentManager.uploadFiles(files);

      expect(attachmentManager.successfulUploadsCount).toBeLessThanOrEqual(
        API_MAX_FILES_ALLOWED_PER_MESSAGE,
      );
    });
  });

  describe('ensureLocalUploadAttachment', () => {
    it('should add error notification when file is missing', async () => {
      const {
        messageComposer: { attachmentManager },
        mockClient,
      } = setup();
      // Access the private method using any type
      const ensureLocalUploadAttachment = (attachmentManager as any)
        .ensureLocalUploadAttachment;

      await ensureLocalUploadAttachment({
        localMetadata: {
          id: 'test-id',
          // Missing file property
        },
      });

      expect(mockClient.notifications.addError).toHaveBeenCalledWith({
        message: 'File is required for upload attachment',
        origin: {
          emitter: 'AttachmentManager',
          context: {
            attachment: {
              localMetadata: {
                id: 'test-id',
              },
            },
          },
        },
      });
    });

    it('should add error notification when id is missing', async () => {
      const {
        messageComposer: { attachmentManager },
        mockClient,
      } = setup();
      const ensureLocalUploadAttachment = (attachmentManager as any)
        .ensureLocalUploadAttachment;

      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      await ensureLocalUploadAttachment({
        localMetadata: {
          file,
          // Missing id property
        },
      });

      expect(mockClient.notifications.addError).toHaveBeenCalledWith({
        message: 'File is required for upload attachment',
        origin: {
          emitter: 'AttachmentManager',
          context: {
            attachment: {
              localMetadata: {
                file,
              },
            },
          },
        },
      });
    });

    it('should return undefined when file is filtered out', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();
      const ensureLocalUploadAttachment = (attachmentManager as any)
        .ensureLocalUploadAttachment;

      // Set a fileUploadFilter that blocks all files
      attachmentManager.fileUploadFilter = () => false;

      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const result = await ensureLocalUploadAttachment({
        localMetadata: {
          id: 'test-id',
          file,
        },
      });

      expect(result).toBeUndefined();
    });

    it('should call fileToLocalUploadAttachment when file passes filter', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();
      const ensureLocalUploadAttachment = (attachmentManager as any)
        .ensureLocalUploadAttachment;
      const fileToLocalUploadAttachment = vi.spyOn(
        attachmentManager,
        'fileToLocalUploadAttachment',
      );

      // Set a fileUploadFilter that allows all files
      attachmentManager.fileUploadFilter = () => true;

      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      await ensureLocalUploadAttachment({
        localMetadata: {
          id: 'test-id',
          file,
        },
      });

      expect(fileToLocalUploadAttachment).toHaveBeenCalledWith(file);
    });

    it('should return the result from fileToLocalUploadAttachment', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();
      const ensureLocalUploadAttachment = (attachmentManager as any)
        .ensureLocalUploadAttachment;

      // Set a fileUploadFilter that allows all files
      attachmentManager.fileUploadFilter = () => true;

      // Mock the fileToLocalUploadAttachment method to return a specific value
      const expectedAttachment = {
        type: 'image',
        image_url: 'test-url',
        localMetadata: {
          id: 'test-id',
          file: new File([''], 'test.jpg', { type: 'image/jpeg' }),
          uploadState: 'finished',
        },
      };
      vi.spyOn(attachmentManager, 'fileToLocalUploadAttachment').mockResolvedValue(
        expectedAttachment,
      );

      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const result = await ensureLocalUploadAttachment({
        localMetadata: {
          id: 'test-id',
          file,
        },
      });

      expect(result).toEqual(expectedAttachment);
    });

    it('should preserve original ID if it exists', async () => {
      const {
        messageComposer: { attachmentManager },
      } = setup();
      const ensureLocalUploadAttachment = (attachmentManager as any)
        .ensureLocalUploadAttachment;

      // Set a fileUploadFilter that allows all files
      attachmentManager.fileUploadFilter = () => true;

      // Create an attachment with an ID
      const originalId = 'original-test-id';
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });

      // Mock fileToLocalUploadAttachment to return a new attachment
      const newAttachment = {
        type: 'image',
        image_url: 'test-url',
        localMetadata: {
          id: 'new-test-id', // Different ID
          file: new File([''], 'test.jpg', { type: 'image/jpeg' }),
          uploadState: 'finished',
        },
      };

      vi.spyOn(attachmentManager, 'fileToLocalUploadAttachment').mockResolvedValue(
        newAttachment,
      );

      // Call with original ID
      const result = await ensureLocalUploadAttachment({
        localMetadata: {
          id: originalId,
          file,
        },
      });

      // Verify the original ID was preserved
      expect(result.localMetadata.id).toBe(originalId);
    });
  });
});
