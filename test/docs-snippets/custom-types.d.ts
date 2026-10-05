// Custom data used by the docs snippets, declared the way the docs tell apps to:
// by augmenting the `Custom*Data` interfaces of `stream-chat` (aliased to src).
export {};

declare module 'stream-chat' {
  interface CustomChannelData {
    name?: string;
  }
}
