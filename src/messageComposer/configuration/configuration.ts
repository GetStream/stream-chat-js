import { find } from 'linkifyjs';
import { API_MAX_FILES_ALLOWED_PER_MESSAGE } from '../../constants';
import type {
  AttachmentManagerConfig,
  LinkPreviewsManagerConfig,
  LocationComposerConfig,
  MessageComposerConfig,
} from './types';
import type { TextComposerConfig } from './types';
import { generateUUIDv4 } from '../../utils';

export const DEFAULT_LINK_PREVIEW_MANAGER_CONFIG: LinkPreviewsManagerConfig = {
  debounceURLEnrichmentMs: 1500,
  enabled: false,
  findURLFn: (text: string): string[] =>
    find(text, 'url', { defaultProtocol: 'https' }).reduce<string[]>((acc, link) => {
      try {
        const url = new URL(link.href);
        // Check for valid hostname with at least one dot and valid TLD
        if (link.isLink && /^[a-zA-Z0-9-.]+\.[a-zA-Z]{2,}$/.test(url.hostname)) {
          acc.push(link.href);
        }
      } catch {
        // Invalid URL, skip it
      }
      return acc;
    }, []),
};

export const DEFAULT_ATTACHMENT_MANAGER_CONFIG: AttachmentManagerConfig = {
  acceptedFiles: [], // an empty array means all files are accepted
  fileUploadFilter: () => true,
  maxNumberOfFilesPerMessage: API_MAX_FILES_ALLOWED_PER_MESSAGE,
};

export const DEFAULT_TEXT_COMPOSER_CONFIG: TextComposerConfig = {
  enabled: true,
  publishTypingEvents: true,
};

export const DEFAULT_LOCATION_COMPOSER_CONFIG: LocationComposerConfig = {
  enabled: true,
  getDeviceId: () => generateUUIDv4(),
};

export const DEFAULT_COMPOSER_CONFIG: MessageComposerConfig = {
  attachments: DEFAULT_ATTACHMENT_MANAGER_CONFIG,
  drafts: { enabled: false },
  linkPreviews: DEFAULT_LINK_PREVIEW_MANAGER_CONFIG,
  location: DEFAULT_LOCATION_COMPOSER_CONFIG,
  text: DEFAULT_TEXT_COMPOSER_CONFIG,
};
