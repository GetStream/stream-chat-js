/**
 * The channel methods the message paginator's own queries call, for message paginator tests whose
 * fake channels have no real channel query. Spread them into a fake channel that has a `query`
 * stub: `{ query: vi.fn(), ...fakeChannelQuery }`. `requestChannelState` answers from that stub,
 * which the tests set and assert, and which the paginator's probes use too.
 */
export const fakeChannelQuery = {
  async requestChannelState(
    this: { query: (options: unknown) => Promise<{ messages?: unknown[] } | undefined> },
    options: unknown,
  ) {
    const response = await this.query(options);
    return { messages: response?.messages ?? [] };
  },
  applyChannelStateFromResponse: () => undefined,
  runTrackedQuery: <T>(run: () => Promise<T>) => run(),
};
