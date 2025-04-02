import { StateStore } from '../store';
import type { LocalAttachment } from './types';
import type { DraftMessage, LocalMessage } from '../types';
import { mergeWith } from '../utils/mergeWith';

export type AttachmentManagerState = {
  attachments: LocalAttachment[];
};

export type AttachmentManagerOptions = {
  /** Maximum number of attachments allowed per message */
  maxNumberOfFilesPerMessage?: number;
  message?: DraftMessage | LocalMessage;
};

const initState = (): AttachmentManagerState => ({
  attachments: [],
});

/**
 * AttachmentManager is responsible for managing attachments in the message composer.
 * It is responsible for upserting and removing attachments from the message composer.
 */
export class AttachmentManager {
  readonly state: StateStore<AttachmentManagerState>;

  constructor() {
    this.state = new StateStore<AttachmentManagerState>(initState());
  }

  get attachments() {
    return this.state.getLatestValue().attachments;
  }

  initState = () => {
    this.state.next(initState());
  };

  getAttachmentIndex = (localId: string) =>
    this.attachments.findIndex(
      (attachment) =>
        attachment.localMetadata.id && localId === attachment.localMetadata?.id,
    );

  upsertAttachments = (attachmentsToUpsert: LocalAttachment[]) => {
    if (!attachmentsToUpsert.length) return;
    const stateAttachments = this.attachments;
    const attachments = [...this.attachments];
    attachmentsToUpsert.forEach((upsertedAttachment) => {
      const attachmentIndex = this.getAttachmentIndex(
        upsertedAttachment.localMetadata.id,
      );

      if (attachmentIndex === -1) {
        attachments.push(upsertedAttachment);
      } else {
        attachments.splice(
          attachmentIndex,
          1,
          mergeWith<LocalAttachment>(
            stateAttachments[attachmentIndex] ?? {},
            upsertedAttachment,
          ),
        );
      }
    });

    this.state.partialNext({ attachments });
  };

  removeAttachments = (localAttachmentIds: string[]) => {
    this.state.partialNext({
      attachments: this.attachments.filter(
        (att) => !localAttachmentIds.includes(att.localMetadata?.id),
      ),
    });
  };
}
