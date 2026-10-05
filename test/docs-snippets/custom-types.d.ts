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
}
