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

      const messageAttachments: Attachment[] = (state.message.attachments ?? []).concat(
        linkPreviews,
      );
      const localAttachments: Attachment[] = (
        state.localMessage.attachments ?? []
      ).concat(linkPreviews);

      // prevent introducing attachments array into the payload sent to the server
      if (!messageAttachments.length && !localAttachments.length) return forward();

      const sendOptions = { ...state.sendOptions };
      const skip_enrich_url =
        (!someLinkPreviewsLoading && linkPreviews.length > 0) ||
        someLinkPreviewsDismissed;
      if (skip_enrich_url) {
        sendOptions.skip_enrich_url = true;
      }

      // Each payload gets the `attachments` key only when there is something to put in it,
      // matching the attachments middleware. An empty array is not "nothing to say": on an edit
      // the API reads it as "remove every attachment".
      return next({
        ...state,
        message: messageAttachments.length
          ? {
              ...state.message,
              attachments: messageAttachments,
            }
          : state.message,
        localMessage: localAttachments.length
          ? {
              ...state.localMessage,
              attachments: localAttachments,
            }
          : state.localMessage,
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
