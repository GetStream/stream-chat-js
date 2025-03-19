import type { MessageComposerMiddlewareValue } from './types';
import type { MessageComposer } from '../../messageComposer';
import type { Attachment } from '../../../types';

export const createLinkPreviewsMiddleware = (composer: MessageComposer) => ({
  id: 'linkPreviews',
  compose: ({
    input,
    nextHandler,
  }: {
    input: MessageComposerMiddlewareValue;
    nextHandler: (
      input: MessageComposerMiddlewareValue,
    ) => Promise<MessageComposerMiddlewareValue>;
  }) => {
    const { linkPreviewsManager } = composer;
    linkPreviewsManager.cancelURLEnrichment();
    const someLinkPreviewsLoading = linkPreviewsManager.loadingPreviews.length > 0;
    const someLinkPreviewsDismissed = linkPreviewsManager.dismissedPreviews.length > 0;
    const linkPreviews =
      linkPreviewsManager.loadingPreviews.length > 0
        ? []
        : linkPreviewsManager.loadedPreviews.map(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ({ state: linkPreviewState, ...ogAttachment }) => ogAttachment as Attachment,
          );
    return nextHandler({
      ...input,
      state: {
        message: {
          ...input.state.message,
          attachments: input.state.message.attachments.concat(linkPreviews),
        },
        sendOptions: {
          ...input.state.sendOptions,
          skip_enrich_url:
            (!someLinkPreviewsLoading && linkPreviews.length > 0) ||
            someLinkPreviewsDismissed,
        },
      },
    });
  },
});
