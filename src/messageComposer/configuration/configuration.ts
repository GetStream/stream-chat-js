import { find } from 'linkifyjs';
import { API_MAX_FILES_ALLOWED_PER_MESSAGE } from '../../constants';
import type {
  AttachmentManagerConfig,
  LinkPreviewsManagerConfig,
  MessageComposerConfig,
} from './types';

export const DEFAULT_LINK_PREVIEW_MANAGER_CONFIG: LinkPreviewsManagerConfig = {
  debounceURLEnrichmentMs: 300,
  enabled: true,
  findURLFn: (text: string): string[] =>
    find(text, 'url').reduce<string[]>((acc, link) => {
      if (link.isLink) acc.push(link.href);
      return acc;
    }, []),
};

export const DEFAULT_ATTACHMENT_MANAGER_CONFIG: AttachmentManagerConfig = {
  fileUploadFilter: () => true,
  maxNumberOfFilesPerMessage: API_MAX_FILES_ALLOWED_PER_MESSAGE,
};

export const DEFAULT_COMPOSER_CONFIG: MessageComposerConfig = {
  attachments: {
    fileUploadFilter: () => true,
    maxNumberOfFilesPerMessage: API_MAX_FILES_ALLOWED_PER_MESSAGE,
  },
  drafts: { enabled: false },
  linkPreviews: {
    debounceURLEnrichmentMs: 300,
    enabled: false,
    findURLFn: (text: string): string[] =>
      find(text, 'url').reduce<string[]>((acc, link) => {
        if (link.isLink) acc.push(link.href);
        return acc;
      }, []),
  },
  publishTypingEvents: true,
};
