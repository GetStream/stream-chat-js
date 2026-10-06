// Custom data used by the docs snippets, declared the way the docs tell apps to:
// by augmenting the `Custom*Data` interfaces of `stream-chat` (aliased to src).
export {};

declare module 'stream-chat' {
  interface CustomChannelData {
    name?: string;
    // _default/03-channels/03-channel_update.md
    source?: string;
    source_detail?: { user_id: number };
    channel_detail?: { topic?: string; rating?: string };
    color?: string;
  }

  interface CustomMemberData {
    // _default/03-channels/06-channel_members.md
    code_name?: string;
    key1?: string;
    key2?: string;
    key3?: string;
  }

  interface CustomMessageData {
    // _default/04-messages/01-send_message.md
    priority?: string;
    color?: string;
    details?: { status?: string };
  }

  interface CustomAttachmentData {
    // _default/04-messages/01-send_message.md
    myCustomField?: number;
  }

  interface CustomReactionData {
    // _default/04-messages/04-send_reaction.md
    customField?: string;
  }
}
