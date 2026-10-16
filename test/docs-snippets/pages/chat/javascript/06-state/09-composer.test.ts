import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, StreamChat } from '../../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../../helpers/clients';
import { Cleanup } from '../../../../helpers/cleanup';
import { uniqueId } from '../../../../helpers/ids';
import { retry } from '../../../../helpers/wait';

const DOCS = 'chat/javascript/06-state/09-composer.md';

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('composer');
  let client: StreamChat;
  let channel: Channel;

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
    channel = client.channel('messaging', channelId);
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.watch();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('reads the composer state', () => {
    channel.messageComposer.textComposer.setText('Hello there');

    // #region snippet docs="chat/javascript/06-state/09-composer.md" heading="Reading" tab="JavaScript" index=1
    const { messageComposer } = channel;

    // Typed text, mentions and the active command
    const { text, mentions, command } =
      messageComposer.textComposer.state.getLatestValue();

    // Attachments
    const { attachments } = messageComposer.attachmentManager.state.getLatestValue();

    // Quoted or edited message
    const { quotedMessage, editedMessage } = messageComposer.state.getLatestValue();
    // #endregion snippet

    expect(text).toBe('Hello there');
    expect(mentions ?? []).toEqual([]);
    expect(command ?? null).toBeNull();
    expect(attachments).toEqual([]);
    expect(quotedMessage).toBeNull();
    expect(editedMessage).toBeNull();
  });

  it('subscribes to the composer state', () => {
    const { messageComposer } = channel;
    const renderInput = vi.fn();
    const renderAttachmentPreviews = vi.fn();

    // #region snippet docs="chat/javascript/06-state/09-composer.md" heading="Reading" tab="JavaScript" index=2
    const unsubscribeText = messageComposer.textComposer.state.subscribeWithSelector(
      (state) => ({ text: state.text }),
      ({ text }) => renderInput(text),
    );

    const unsubscribeAttachments =
      messageComposer.attachmentManager.state.subscribeWithSelector(
        (state) => ({ attachments: state.attachments }),
        ({ attachments }) => renderAttachmentPreviews(attachments),
      );
    // #endregion snippet

    try {
      expect(renderAttachmentPreviews).toHaveBeenLastCalledWith([]);
      messageComposer.textComposer.setText('Typing more');
      expect(renderInput).toHaveBeenLastCalledWith('Typing more');
    } finally {
      unsubscribeText();
      unsubscribeAttachments();
    }
  });

  it('sends the composed message', async () => {
    const { messageComposer } = channel;

    // #region snippet docs="chat/javascript/06-state/09-composer.md" heading="Send message" tab="JavaScript" index=1
    // Usually called from your input's change handler
    messageComposer.textComposer.setText('Hello!');

    // "sent", "nothing-to-send" (the composer keeps its content) or "failed"
    const result = await messageComposer.send();
    // #endregion snippet

    expect(result).toBe('sent');
    // The composer is cleared, and the message is in the channel
    expect(messageComposer.textComposer.text).toBe('');
    await retry(() => {
      expect(channel.messagePaginator.items?.map((message) => message.text)).toContain(
        'Hello!',
      );
      return Promise.resolve();
    });

    // Nothing left to send
    expect(await messageComposer.send()).toBe('nothing-to-send');
  });
});
