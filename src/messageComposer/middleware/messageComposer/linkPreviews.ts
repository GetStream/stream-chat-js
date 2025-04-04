import type {
  MessageComposerMiddlewareValue,
  MessageDraftComposerMiddlewareValue,
} from './types';
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
    if (!linkPreviewsManager) return nextHandler(input);

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

export const createDraftLinkPreviewsMiddleware = (composer: MessageComposer) => ({
  id: 'linkPreviews',
  compose: ({
    input,
    nextHandler,
  }: {
    input: MessageDraftComposerMiddlewareValue;
    nextHandler: (
      input: MessageDraftComposerMiddlewareValue,
    ) => Promise<MessageDraftComposerMiddlewareValue>;
  }) => {
    const { linkPreviewsManager } = composer;
    if (!linkPreviewsManager) return nextHandler(input);

    linkPreviewsManager.cancelURLEnrichment();
    const linkPreviews = linkPreviewsManager.loadedPreviews.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ state: linkPreviewState, ...ogAttachment }) => ogAttachment as Attachment,
    );

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
