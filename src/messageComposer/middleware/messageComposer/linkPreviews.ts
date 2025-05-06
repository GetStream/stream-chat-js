import { LinkPreviewsManager } from '../..';
import type { MiddlewareHandlerParams } from '../../../middleware';
import type { Attachment } from '../../../types';
import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
} from './types';

export const createLinkPreviewsCompositionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/link-previews',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const { linkPreviewsManager } = composer;
      if (!linkPreviewsManager) return forward();

      linkPreviewsManager.cancelURLEnrichment();
      const someLinkPreviewsLoading = linkPreviewsManager.loadingPreviews.length > 0;
      const someLinkPreviewsDismissed = linkPreviewsManager.dismissedPreviews.length > 0;
      const linkPreviews =
        linkPreviewsManager.loadingPreviews.length > 0
          ? []
          : linkPreviewsManager.loadedPreviews.map((preview) =>
              LinkPreviewsManager.getPreviewData(preview),
            );

      const attachments: Attachment[] = (state.message.attachments ?? []).concat(
        linkPreviews,
      );

      // prevent introducing attachments array into the payload sent to the server
      if (!attachments.length) return forward();

      const sendOptions = { ...state.sendOptions };
      const skip_enrich_url =
        (!someLinkPreviewsLoading && linkPreviews.length > 0) ||
        someLinkPreviewsDismissed;
      if (skip_enrich_url) {
        sendOptions.skip_enrich_url = true;
      }

      return next({
        ...state,
        message: {
          ...state.message,
          attachments,
        },
        localMessage: {
          ...state.localMessage,
          attachments,
        },
        sendOptions,
      });
    },
  },
});

export const createDraftLinkPreviewsCompositionMiddleware = (
  composer: MessageComposer,
): MessageDraftCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/draft-link-previews',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
      const { linkPreviewsManager } = composer;
      if (!linkPreviewsManager) return forward();

      linkPreviewsManager.cancelURLEnrichment();
      const linkPreviews = linkPreviewsManager.loadedPreviews.map((preview) =>
        LinkPreviewsManager.getPreviewData(preview),
      );

      if (!linkPreviews.length) return forward();

      return next({
        ...state,
        draft: {
          ...state.draft,
          attachments: (state.draft.attachments ?? []).concat(linkPreviews),
        },
      });
    },
  },
});
