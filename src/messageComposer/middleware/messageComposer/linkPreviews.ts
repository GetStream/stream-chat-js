import type { MiddlewareHandlerParams } from '../../../middleware';
import type { Attachment } from '../../../types';
import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareValueState,
  MessageDraftComposerMiddlewareValueState,
} from './types';

export const createLinkPreviewsCompositionMiddleware = (composer: MessageComposer) => ({
  id: 'stream-io/message-composer-middleware/link-previews',
  compose: ({
    input,
    nextHandler,
  }: MiddlewareHandlerParams<MessageComposerMiddlewareValueState>) => {
    const { linkPreviewsManager } = composer;
    if (!linkPreviewsManager) return nextHandler(input);

    linkPreviewsManager.cancelURLEnrichment();
    const someLinkPreviewsLoading = linkPreviewsManager.loadingPreviews.length > 0;
    const someLinkPreviewsDismissed = linkPreviewsManager.dismissedPreviews.length > 0;
    const linkPreviews =
      linkPreviewsManager.loadingPreviews.length > 0
        ? []
        : linkPreviewsManager.loadedPreviews.map((preview) => preview.data);

    const attachments: Attachment[] = (input.state.message.attachments ?? []).concat(
      linkPreviews,
    );

    // prevent introducing attachments array into the payload sent to the server
    if (!attachments.length) return nextHandler(input);

    const sendOptions = { ...input.state.sendOptions };
    const skip_enrich_url =
      (!someLinkPreviewsLoading && linkPreviews.length > 0) || someLinkPreviewsDismissed;
    if (skip_enrich_url) {
      sendOptions.skip_enrich_url = true;
    }

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        message: {
          ...input.state.message,
          attachments,
        },
        localMessage: {
          ...input.state.localMessage,
          attachments,
        },
        sendOptions,
      },
    });
  },
});

export const createDraftLinkPreviewsCompositionMiddleware = (
  composer: MessageComposer,
) => ({
  id: 'stream-io/message-composer-middleware/draft-link-previews',
  compose: ({
    input,
    nextHandler,
  }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
    const { linkPreviewsManager } = composer;
    if (!linkPreviewsManager) return nextHandler(input);

    linkPreviewsManager.cancelURLEnrichment();
    const linkPreviews = linkPreviewsManager.loadedPreviews.map(
      (preview) => preview.data,
    );

    if (!linkPreviews.length) return nextHandler(input);

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        draft: {
          ...input.state.draft,
          attachments: (input.state.draft.attachments ?? []).concat(linkPreviews),
        },
      },
    });
  },
});
