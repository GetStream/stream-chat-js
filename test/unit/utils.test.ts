import { expect } from 'chai';
import sinon from 'sinon';
import { v4 as uuidv4 } from 'uuid';

import { generateMsg } from './test-utils/generateMessage';
import { generateChannel } from './test-utils/generateChannel';
import { generateMember } from './test-utils/generateMember';
import { generateUser } from './test-utils/generateUser';
import { getClientWithUser } from './test-utils/getClient';

import {
  getAndWatchChannel,
  addToMessageList,
  findIndexInSortedArray,
  formatMessage,
  generateChannelTempCid,
  shouldConsiderArchivedChannels,
  shouldConsiderPinnedChannels,
  isChannelArchived,
  isChannelPinned,
  findLastPinnedChannelIndex,
  findPinnedAtSortOrder,
  extractSortValue,
  promoteChannel,
  uniqBy,
} from '../../src/utils';

import type { ChannelFilters, ChannelSortBase, FormatMessageResponse, MessageResponse } from '../../src';
import { StreamChat, Channel } from '../../src';

describe('addToMessageList', () => {
  const timestamp = new Date('2024-09-18T15:30:00.000Z').getTime();
  // messages with each created_at 10 seconds apart
  let messagesBefore: FormatMessageResponse[];

  const getNewFormattedMessage = ({ timeOffset, id = uuidv4() }: { timeOffset: number; id?: string }) =>
    formatMessage(
      generateMsg({
        id,
        created_at: new Date(timestamp + timeOffset),
      }) as MessageResponse,
    );

  beforeEach(() => {
    messagesBefore = Array.from({ length: 5 }, (_, index) =>
      formatMessage(generateMsg({ created_at: new Date(timestamp + index * 10 * 1000) }) as MessageResponse),
    );
  });

  it('new message is inserted at the correct index', () => {
    const newMessage = getNewFormattedMessage({ timeOffset: 25 * 1000 });

    const messagesAfter = addToMessageList(messagesBefore, newMessage);

    expect(messagesAfter).to.not.equal(messagesBefore);
    expect(messagesAfter).to.have.length(6);
    expect(messagesAfter).to.contain(newMessage);
    expect(messagesAfter[3]).to.equal(newMessage);
  });

  it('replaces the message which created_at changed to a server response created_at', () => {
    const newMessage = getNewFormattedMessage({ timeOffset: 33 * 1000, id: messagesBefore[2].id });

    expect(newMessage.id).to.equal(messagesBefore[2].id);

    const messagesAfter = addToMessageList(messagesBefore, newMessage, true);

    expect(messagesAfter).to.not.equal(messagesBefore);
    expect(messagesAfter).to.have.length(5);
    expect(messagesAfter).to.contain(newMessage);
    expect(messagesAfter[3]).to.equal(newMessage);
  });

  it('adds a new message to an empty message list', () => {
    const newMessage = getNewFormattedMessage({ timeOffset: 0 });

    const emptyMessagesBefore = [];

    const messagesAfter = addToMessageList(emptyMessagesBefore, newMessage);

    expect(messagesAfter).to.have.length(1);
    expect(messagesAfter).to.contain(newMessage);
  });

  it("doesn't add a new message to an empty message list if timestampChanged & addIfDoesNotExist are false", () => {
    const newMessage = getNewFormattedMessage({ timeOffset: 0 });

    const emptyMessagesBefore = [];

    const messagesAfter = addToMessageList(emptyMessagesBefore, newMessage, false, 'created_at', false);

    expect(messagesAfter).to.have.length(0);
  });

  it("adds message to the end of the list if it's the newest one", () => {
    const newMessage = getNewFormattedMessage({ timeOffset: 50 * 1000 });

    const messagesAfter = addToMessageList(messagesBefore, newMessage);

    expect(messagesAfter).to.have.length(6);
    expect(messagesAfter).to.contain(newMessage);
    expect(messagesAfter.at(-1)).to.equal(newMessage);
  });

  it("doesn't add a newest message to a message list if timestampChanged & addIfDoesNotExist are false", () => {
    const newMessage = getNewFormattedMessage({ timeOffset: 50 * 1000 });

    const messagesAfter = addToMessageList(messagesBefore, newMessage, false, 'created_at', false);

    expect(messagesAfter).to.have.length(5);
    // FIXME: it'd be nice if the function returned old
    // unchanged array in case of no modification such as this one
    expect(messagesAfter).to.deep.equal(messagesBefore);
  });

  it("updates an existing message that wasn't filtered due to changed timestamp (timestampChanged)", () => {
    const newMessage = getNewFormattedMessage({ timeOffset: 30 * 1000, id: messagesBefore[4].id });

    expect(messagesBefore[4].id).to.equal(newMessage.id);
    expect(messagesBefore[4].text).to.not.equal(newMessage.text);
    expect(messagesBefore[4]).to.not.equal(newMessage);

    const messagesAfter = addToMessageList(messagesBefore, newMessage, false, 'created_at', false);

    expect(messagesAfter).to.have.length(5);
    expect(messagesAfter[4]).to.equal(newMessage);
  });
});

describe('findIndexInSortedArray', () => {
  it('finds index in the middle of haystack (asc)', () => {
    const needle = 5;
    const haystack = [1, 2, 3, 4, 6, 7, 8, 9];
    const index = findIndexInSortedArray({ needle, sortedArray: haystack, sortDirection: 'ascending' });
    expect(index).to.eq(4);
  });

  it('finds index at the top of haystack (asc)', () => {
    const needle = 0;
    const haystack = [1, 2, 3, 4, 6, 7, 8, 9];
    const index = findIndexInSortedArray({ needle, sortedArray: haystack, sortDirection: 'ascending' });
    expect(index).to.eq(0);
  });

  it('finds index at the bottom of haystack (asc)', () => {
    const needle = 10;
    const haystack = [1, 2, 3, 4, 6, 7, 8, 9];
    const index = findIndexInSortedArray({ needle, sortedArray: haystack, sortDirection: 'ascending' });
    expect(index).to.eq(8);
  });

  it('in a haystack with duplicates, prefers index closer to the bottom (asc)', () => {
    const needle = 5;
    const haystack = [1, 5, 5, 5, 5, 5, 8, 9];
    const index = findIndexInSortedArray({ needle, sortedArray: haystack, sortDirection: 'ascending' });
    expect(index).to.eq(6);
  });

  it('in a haystack with duplicates, look up an item by key (asc)', () => {
    const haystack: [key: string, value: number][] = [
      ['one', 1],
      ['five-1', 5],
      ['five-2', 5],
      ['five-3', 5],
      ['nine', 9],
    ];

    const selectKey = (tuple: [key: string, value: number]) => tuple[0];
    const selectValue = (tuple: [key: string, value: number]) => tuple[1];

    expect(
      findIndexInSortedArray({
        needle: ['five-1', 5],
        sortedArray: haystack,
        sortDirection: 'ascending',
        selectKey,
        selectValueToCompare: selectValue,
      }),
    ).to.eq(1);

    expect(
      findIndexInSortedArray({
        needle: ['five-2', 5],
        sortedArray: haystack,
        sortDirection: 'ascending',
        selectKey,
        selectValueToCompare: selectValue,
      }),
    ).to.eq(2);

    expect(
      findIndexInSortedArray({
        needle: ['five-3', 5],
        sortedArray: haystack,
        sortDirection: 'ascending',
        selectKey,
        selectValueToCompare: selectValue,
      }),
    ).to.eq(3);
  });

  it('finds index in the middle of haystack (desc)', () => {
    const needle = 5;
    const haystack = [9, 8, 7, 6, 4, 3, 2, 1];
    const index = findIndexInSortedArray({ needle, sortedArray: haystack, sortDirection: 'descending' });
    expect(index).to.eq(4);
  });

  it('finds index at the top of haystack (desc)', () => {
    const needle = 10;
    const haystack = [9, 8, 7, 6, 4, 3, 2, 1];
    const index = findIndexInSortedArray({ needle, sortedArray: haystack, sortDirection: 'descending' });
    expect(index).to.eq(0);
  });

  it('finds index at the bottom of haystack (desc)', () => {
    const needle = 0;
    const haystack = [9, 8, 7, 6, 4, 3, 2, 1];
    const index = findIndexInSortedArray({ needle, sortedArray: haystack, sortDirection: 'descending' });
    expect(index).to.eq(8);
  });

  it('in a haystack with duplicates, prefers index closer to the top (desc)', () => {
    const needle = 5;
    const haystack = [9, 8, 5, 5, 5, 5, 5, 1];
    const index = findIndexInSortedArray({ needle, sortedArray: haystack, sortDirection: 'descending' });
    expect(index).to.eq(2);
  });

  it('in a haystack with duplicates, look up an item by key (desc)', () => {
    const haystack: [key: string, value: number][] = [
      ['nine', 9],
      ['five-1', 5],
      ['five-2', 5],
      ['five-3', 5],
      ['one', 1],
    ];

    const selectKey = (tuple: [key: string, value: number]) => tuple[0];
    const selectValue = (tuple: [key: string, value: number]) => tuple[1];

    expect(
      findIndexInSortedArray({
        needle: ['five-1', 5],
        sortedArray: haystack,
        sortDirection: 'descending',
        selectKey,
        selectValueToCompare: selectValue,
      }),
    ).to.eq(1);

    expect(
      findIndexInSortedArray({
        needle: ['five-2', 5],
        sortedArray: haystack,
        sortDirection: 'descending',
        selectKey,
        selectValueToCompare: selectValue,
      }),
    ).to.eq(2);

    expect(
      findIndexInSortedArray({
        needle: ['five-3', 5],
        sortedArray: haystack,
        sortDirection: 'descending',
        selectKey,
        selectValueToCompare: selectValue,
      }),
    ).to.eq(3);
  });
});

describe('getAndWatchChannel', () => {
  let client: StreamChat;
  let sandbox: sinon.SinonSandbox;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();

    client = await getClientWithUser();

    const mockedMembers = [generateMember({ user: generateUser() }), generateMember({ user: generateUser() })];
    const mockedChannelsQueryResponse = [
      ...Array.from({ length: 2 }, () => generateChannel()),
      generateChannel({ channel: { type: 'messaging' }, members: mockedMembers }),
    ];
    const mock = sandbox.mock(client);
    mock.expects('post').returns(Promise.resolve({ channels: mockedChannelsQueryResponse }));
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should throw an error if neither channel nor type is provided', async () => {
    await client.queryChannels({});
    await expect(getAndWatchChannel({ client, id: 'test-id', members: [] })).to.be.rejectedWith(
      'Channel or channel type have to be provided to query a channel.',
    );
  });

  it('should throw an error if neither channel ID nor members array is provided', async () => {
    await client.queryChannels({});
    await expect(getAndWatchChannel({ client, type: 'test-type', id: undefined, members: [] })).to.be.rejectedWith(
      'Channel ID or channel members array have to be provided to query a channel.',
    );
  });

  it('should return an existing channel if provided', async () => {
    const channels = await client.queryChannels({});
    const channel = channels[0];
    const watchStub = sandbox.stub(channel, 'watch');
    const result = await getAndWatchChannel({
      channel,
      client,
      members: [],
      options: {},
    });

    expect(result).to.equal(channel);
    expect(watchStub.calledOnce).to.be.true;
  });

  it('should return the channel if only type and id are provided', async () => {
    const channels = await client.queryChannels({});
    const channel = channels[0];
    const { id, type } = channel;
    const watchStub = sandbox.stub(channel, 'watch');
    const channelSpy = sandbox.spy(client, 'channel');
    const result = await getAndWatchChannel({
      client,
      type,
      id,
      options: {},
    });

    expect(channelSpy.calledOnce).to.be.true;
    // @ts-ignore
    expect(channelSpy.calledWith(type, id)).to.be.true;
    expect(watchStub.calledOnce).to.be.true;
    expect(result).to.equal(channel);
  });

  it('should return the channel if only type and members are provided', async () => {
    const channels = await client.queryChannels({});
    const channel = channels[2];
    const { type } = channel;
    const members = Object.keys(channel.state.members);
    const watchStub = sandbox.stub(channel, 'watch');
    const channelSpy = sandbox.spy(client, 'channel');
    const result = await getAndWatchChannel({
      client,
      type,
      members,
      options: {},
    });
    expect(channelSpy.calledOnce).to.be.true;
    // @ts-ignore
    expect(channelSpy.calledWith(type, undefined, { members })).to.be.true;
    expect(watchStub.calledOnce).to.be.true;
    expect(result).to.equal(channel);
  });

  it('should not call watch again if a query is already in progress', async () => {
    const channels = await client.queryChannels({});
    const channel = channels[0];
    const { id, type, cid } = channel;
    // @ts-ignore
    const watchStub = sandbox.stub(channel, 'watch').resolves({});

    const result = await Promise.all([
      getAndWatchChannel({
        client,
        type,
        id,
        members: [],
        options: {},
      }),
      getAndWatchChannel({
        client,
        type,
        id,
        members: [],
        options: {},
      }),
    ]);

    expect(watchStub.calledOnce).to.be.true;
    expect(result[0]).to.equal(channel);
    expect(result[1]).to.equal(channel);
  });
});

describe('generateChannelTempCid', () => {
  it('should return a valid temp cid for valid input', () => {
    const result = generateChannelTempCid('messaging', ['alice', 'bob']);
    expect(result).to.equal('messaging:!members-alice,bob');
  });

  it('should return undefined if members is null', () => {
    const result = generateChannelTempCid('messaging', (null as unknown) as string[]);
    expect(result).to.be.undefined;
  });

  it('should return undefined if members is an empty array', () => {
    const result = generateChannelTempCid('messaging', []);
    expect(result).to.be.undefined;
  });

  it('should correctly format cid for multiple members', () => {
    const result = generateChannelTempCid('team', ['zack', 'alice', 'charlie']);
    expect(result).to.equal('team:!members-alice,charlie,zack');
  });
});

describe('Channel pinning and archiving utils', () => {
  let client: StreamChat;
  let sandbox: sinon.SinonSandbox;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    client = await getClientWithUser();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Channel pinning', () => {
    it('should return false if channel is null', () => {
      expect(isChannelPinned((null as unknown) as Channel)).to.be.false;
    });

    it('should return false if pinned_at is undefined', () => {
      const channelResponse = generateChannel({ membership: {} });
      client.hydrateActiveChannels([channelResponse]);
      const channel = client.channel(channelResponse.channel.type, channelResponse.channel.id);
      expect(isChannelPinned(channel)).to.be.false;
    });

    it('should return true if pinned_at is set', () => {
      const channelResponse = generateChannel({ membership: { pinned_at: '2024-02-04T12:00:00Z' } });
      client.hydrateActiveChannels([channelResponse]);
      const channel = client.channel(channelResponse.channel.type, channelResponse.channel.id);
      expect(isChannelPinned(channel)).to.be.true;
    });

    describe('extractSortValue', () => {
      it('should return null if sort is undefined', () => {
        expect(extractSortValue({ atIndex: 0, targetKey: 'pinned_at', sort: undefined })).to.be.null;
      });

      it('should extract correct sort value from an array', () => {
        const sort = ([{ pinned_at: -1 }, { created_at: 1 }] as unknown) as ChannelSortBase;
        expect(extractSortValue({ atIndex: 0, targetKey: 'pinned_at', sort })).to.equal(-1);
      });

      it('should extract correct sort value from an object', () => {
        const sort = ({ pinned_at: 1 } as unknown) as ChannelSortBase;
        expect(extractSortValue({ atIndex: 0, targetKey: 'pinned_at', sort })).to.equal(1);
      });

      it('should return null if key does not match targetKey', () => {
        const sort = ({ created_at: 1 } as unknown) as ChannelSortBase;
        expect(extractSortValue({ atIndex: 0, targetKey: 'pinned_at', sort })).to.be.null;
      });
    });

    describe('shouldConsiderPinnedChannels', () => {
      it('should return false if sort is undefined', () => {
        expect(shouldConsiderPinnedChannels(undefined as any)).to.be.false;
      });

      it('should return false if pinned_at is not a number', () => {
        const sort = [{ pinned_at: 'invalid' }];
        expect(shouldConsiderPinnedChannels(sort as any)).to.be.false;
      });

      it('should return false if pinned_at is not first in sort', () => {
        const sort = ([{ created_at: 1 }, { pinned_at: 1 }] as unknown) as ChannelSortBase;
        expect(shouldConsiderPinnedChannels(sort)).to.be.false;
      });

      it('should return true if pinned_at is 1 or -1 at index 0', () => {
        const sort1 = ([{ pinned_at: 1 }] as unknown) as ChannelSortBase;
        const sort2 = ([{ pinned_at: -1 }] as unknown) as ChannelSortBase;
        expect(shouldConsiderPinnedChannels(sort1)).to.be.true;
        expect(shouldConsiderPinnedChannels(sort2)).to.be.true;
      });
    });

    describe('findPinnedAtSortOrder', () => {
      it('should return null if sort is undefined', () => {
        expect(findPinnedAtSortOrder({ sort: (null as unknown) as ChannelSortBase })).to.be.null;
      });

      it('should return null if pinned_at is not present', () => {
        const sort = ([{ created_at: 1 }] as unknown) as ChannelSortBase;
        expect(findPinnedAtSortOrder({ sort })).to.be.null;
      });

      it('should return pinned_at if found in an object', () => {
        const sort = ({ pinned_at: -1 } as unknown) as ChannelSortBase;
        expect(findPinnedAtSortOrder({ sort })).to.equal(-1);
      });

      it('should return pinned_at if found in an array', () => {
        const sort = ([{ pinned_at: 1 }] as unknown) as ChannelSortBase;
        expect(findPinnedAtSortOrder({ sort })).to.equal(1);
      });
    });

    describe('findLastPinnedChannelIndex', () => {
      it('should return null if no channels are provided', () => {
        expect(findLastPinnedChannelIndex({ channels: [] })).to.be.null;
      });

      it('should return null if no channels are pinned', () => {
        const channelsResponse = [generateChannel({ membership: {} }), generateChannel({ membership: {} })];
        client.hydrateActiveChannels(channelsResponse);
        const channels = channelsResponse.map((c) => client.channel(c.channel.type, c.channel.id));
        expect(findLastPinnedChannelIndex({ channels })).to.be.null;
      });

      it('should return last index of a pinned channel', () => {
        const channelsResponse = [
          generateChannel({ membership: { pinned_at: '2024-02-04T12:00:00Z' } }),
          generateChannel({ membership: { pinned_at: '2024-02-04T12:01:00Z' } }),
          generateChannel({ membership: {} }),
        ];
        client.hydrateActiveChannels(channelsResponse);
        const channels = channelsResponse.map((c) => client.channel(c.channel.type, c.channel.id));

        expect(findLastPinnedChannelIndex({ channels })).to.equal(1);
      });
    });
  });

  describe('Channel archiving', () => {
    it('should return false if channel is null', () => {
      expect(isChannelArchived((null as unknown) as Channel)).to.be.false;
    });

    it('should return false if archived_at is undefined', () => {
      const channelResponse = generateChannel({ membership: {} });
      client.hydrateActiveChannels([channelResponse]);
      const channel = client.channel(channelResponse.channel.type, channelResponse.channel.id);
      expect(isChannelArchived(channel)).to.be.false;
    });

    it('should return true if archived_at is set', () => {
      const channelResponse = generateChannel({ membership: { archived_at: '2024-02-04T12:00:00Z' } });
      client.hydrateActiveChannels([channelResponse]);
      const channel = client.channel(channelResponse.channel.type, channelResponse.channel.id);
      expect(isChannelArchived(channel)).to.be.true;
    });

    it('should return false if filters is null', () => {
      expect(shouldConsiderArchivedChannels((null as unknown) as ChannelFilters)).to.be.false;
    });

    it('should return false if filters.archived is missing', () => {
      const mockFilters = {};
      expect(shouldConsiderArchivedChannels(mockFilters)).to.be.false;
    });

    it('should return false if filters.archived is not a boolean', () => {
      const mockFilters = ({ archived: 'yes' } as unknown) as ChannelFilters;
      expect(shouldConsiderArchivedChannels(mockFilters)).to.be.false;
    });

    it('should return true if filters.archived is true', () => {
      const mockFilters = { archived: true };
      expect(shouldConsiderArchivedChannels(mockFilters)).to.be.true;
    });

    it('should return true if filters.archived is false', () => {
      const mockFilters = { archived: false };
      expect(shouldConsiderArchivedChannels(mockFilters)).to.be.true;
    });
  });
});

describe('promoteChannel', () => {
  let client: StreamChat;

  beforeEach(async () => {
    client = await getClientWithUser();
  });

  it('should return the original list if the channel is already at the top', () => {
    const channelsResponse = [generateChannel(), generateChannel()];
    client.hydrateActiveChannels(channelsResponse);
    const channels = channelsResponse.map((c) => client.channel(c.channel.type, c.channel.id));
    const result = promoteChannel({
      channels,
      channelToMove: channels[0],
      sort: {},
    });

    expect(result).to.deep.equal(channels);
    expect(result).to.be.equal(channels);
  });

  it('should return the original list if the channel is pinned and pinned channels should be considered', () => {
    const channelsResponse = [
      generateChannel({ membership: { pinned_at: '2024-02-04T12:00:00Z' } }),
      generateChannel({ membership: { pinned_at: '2024-02-04T12:01:00Z' } }),
    ];
    client.hydrateActiveChannels(channelsResponse);
    const channels = channelsResponse.map((c) => client.channel(c.channel.type, c.channel.id));
    const channelToMove = channels[1];

    const result = promoteChannel({
      channels,
      channelToMove,
      sort: [{ pinned_at: 1 }],
    });

    expect(result).to.deep.equal(channels);
    expect(result).to.be.equal(channels);
  });

  it('should move a non-pinned channel upwards if it exists in the list', () => {
    const channelsResponse = [
      generateChannel({ channel: { id: 'channel1' } }),
      generateChannel({ channel: { id: 'channel2' } }),
      generateChannel({ channel: { id: 'channel3' } }),
    ];
    client.hydrateActiveChannels(channelsResponse);
    const channels = channelsResponse.map((c) => client.channel(c.channel.type, c.channel.id));
    const channelToMove = channels[2];

    const result = promoteChannel({
      channels,
      channelToMove,
      sort: {},
    });

    expect(result.map((c) => c.id)).to.deep.equal(['channel3', 'channel1', 'channel2']);
    expect(result).to.not.equal(channels);
  });

  it('should correctly move a non-pinned channel if its index is provided', () => {
    const channelsResponse = [
      generateChannel({ channel: { id: 'channel1' } }),
      generateChannel({ channel: { id: 'channel2' } }),
      generateChannel({ channel: { id: 'channel3' } }),
    ];
    client.hydrateActiveChannels(channelsResponse);
    const channels = channelsResponse.map((c) => client.channel(c.channel.type, c.channel.id));
    const channelToMove = channels[2];

    const result = promoteChannel({
      channels,
      channelToMove,
      sort: {},
      channelToMoveIndexWithinChannels: 2,
    });

    expect(result.map((c) => c.id)).to.deep.equal(['channel3', 'channel1', 'channel2']);
    expect(result).to.not.equal(channels);
  });

  it('should move a non-pinned channel upwards if it does not exist in the list', () => {
    const channelsResponse = [
      generateChannel({ channel: { id: 'channel1' } }),
      generateChannel({ channel: { id: 'channel2' } }),
      generateChannel({ channel: { id: 'channel3' } }),
    ];
    const newChannel = generateChannel({ channel: { id: 'channel4' } });
    client.hydrateActiveChannels([...channelsResponse, newChannel]);
    const channels = channelsResponse.map((c) => client.channel(c.channel.type, c.channel.id));
    const channelToMove = client.channel(newChannel.channel.type, newChannel.channel.id);

    const result = promoteChannel({
      channels,
      channelToMove,
      sort: {},
    });

    expect(result.map((c) => c.id)).to.deep.equal(['channel4', 'channel1', 'channel2', 'channel3']);
    expect(result).to.not.equal(channels);
  });

  it('should correctly move a non-pinned channel upwards if it does not exist and the index is provided', () => {
    const channelsResponse = [
      generateChannel({ channel: { id: 'channel1' } }),
      generateChannel({ channel: { id: 'channel2' } }),
      generateChannel({ channel: { id: 'channel3' } }),
    ];
    const newChannel = generateChannel({ channel: { id: 'channel4' } });
    client.hydrateActiveChannels([...channelsResponse, newChannel]);
    const channels = channelsResponse.map((c) => client.channel(c.channel.type, c.channel.id));
    const channelToMove = client.channel(newChannel.channel.type, newChannel.channel.id);

    const result = promoteChannel({
      channels,
      channelToMove,
      sort: {},
      channelToMoveIndexWithinChannels: -1,
    });

    expect(result.map((c) => c.id)).to.deep.equal(['channel4', 'channel1', 'channel2', 'channel3']);
    expect(result).to.not.equal(channels);
  });

  it('should move the channel just below the last pinned channel if pinned channels are considered', () => {
    const channelsResponse = [
      generateChannel({ channel: { id: 'pinned1' }, membership: { pinned_at: '2024-02-04T12:00:00Z' } }),
      generateChannel({ channel: { id: 'pinned2' }, membership: { pinned_at: '2024-02-04T12:01:00Z' } }),
      generateChannel({ channel: { id: 'channel1' } }),
      generateChannel({ channel: { id: 'channel2' } }),
    ];
    client.hydrateActiveChannels(channelsResponse);
    const channels = channelsResponse.map((c) => client.channel(c.channel.type, c.channel.id));
    const channelToMove = channels[3];

    const result = promoteChannel({
      channels,
      channelToMove,
      sort: [{ pinned_at: -1 }],
    });

    expect(result.map((c) => c.id)).to.deep.equal(['pinned1', 'pinned2', 'channel2', 'channel1']);
    expect(result).to.not.equal(channels);
  });

  it('should move the channel to the top of the list if pinned channels exist but are not considered', () => {
    const channelsResponse = [
      generateChannel({ channel: { id: 'pinned1' }, membership: { pinned_at: '2024-02-04T12:01:00Z' } }),
      generateChannel({ channel: { id: 'pinned2' }, membership: { pinned_at: '2024-02-04T12:00:00Z' } }),
      generateChannel({ channel: { id: 'channel1' } }),
      generateChannel({ channel: { id: 'channel2' } }),
    ];
    client.hydrateActiveChannels(channelsResponse);
    const channels = channelsResponse.map((c) => client.channel(c.channel.type, c.channel.id));
    const channelToMove = channels[2];

    const result = promoteChannel({
      channels,
      channelToMove,
      sort: {},
    });

    expect(result.map((c) => c.id)).to.deep.equal(['channel1', 'pinned1', 'pinned2', 'channel2']);
    expect(result).to.not.equal(channels);
  });
});

describe('uniqBy', () => {
  it('should return an empty array if input is not an array', () => {
    expect(uniqBy(null, 'id')).to.deep.equal([]);
    expect(uniqBy(undefined, 'id')).to.deep.equal([]);
    expect(uniqBy(42, 'id')).to.deep.equal([]);
    expect(uniqBy({}, 'id')).to.deep.equal([]);
  });

  it('should remove duplicates based on a property name', () => {
    const array = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 1, name: 'Alice' },
    ];
    const result = uniqBy(array, 'id');
    expect(result).to.deep.equal([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);
  });

  it('should remove duplicates based on a computed function', () => {
    const array = [
      { id: 1, value: 10 },
      { id: 2, value: 20 },
      { id: 3, value: 10 },
    ];
    const result = uniqBy(array, (item: { id: number; value: number }) => item.value);
    expect(result).to.deep.equal([
      { id: 1, value: 10 },
      { id: 2, value: 20 },
    ]);
  });

  it('should return the same array if all elements are unique', () => {
    const array = [
      { id: 1, value: 'A' },
      { id: 2, value: 'B' },
      { id: 3, value: 'C' },
    ];
    expect(uniqBy(array, 'id')).to.deep.equal(array);
  });

  it('should work with nested properties', () => {
    const array = [
      { user: { id: 1, name: 'Alice' } },
      { user: { id: 2, name: 'Bob' } },
      { user: { id: 1, name: 'Alice' } },
    ];
    const result = uniqBy(array, 'user.id');
    expect(result).to.deep.equal([{ user: { id: 1, name: 'Alice' } }, { user: { id: 2, name: 'Bob' } }]);
  });

  it('should work with primitive identities', () => {
    expect(uniqBy([1, 2, 2, 3, 1], (x) => x)).to.deep.equal([1, 2, 3]);
    expect(uniqBy(['a', 'b', 'a', 'c'], (x) => x)).to.deep.equal(['a', 'b', 'c']);
  });

  it('should handle an empty array', () => {
    expect(uniqBy([], 'id')).to.deep.equal([]);
  });

  it('should handle falsy values correctly', () => {
    const array = [{ id: 0 }, { id: false }, { id: null }, { id: undefined }, { id: 0 }];
    const result = uniqBy(array, 'id');
    expect(result).to.deep.equal([{ id: 0 }, { id: false }, { id: null }, { id: undefined }]);
  });

  it('should work when all elements are identical', () => {
    const array = [
      { id: 1, name: 'Alice' },
      { id: 1, name: 'Alice' },
      { id: 1, name: 'Alice' },
    ];
    expect(uniqBy(array, 'id')).to.deep.equal([{ id: 1, name: 'Alice' }]);
  });

  it('should handle mixed types correctly', () => {
    const array = [{ id: 1 }, { id: '1' }, { id: 1.0 }, { id: true }, { id: false }];
    expect(uniqBy(array, 'id')).to.deep.equal([{ id: 1 }, { id: '1' }, { id: true }, { id: false }]);
  });

  it('should handle undefined values in objects', () => {
    const array = [{ id: undefined }, { id: undefined }, { id: 1 }, { id: 2 }];
    expect(uniqBy(array, 'id')).to.deep.equal([{ id: undefined }, { id: 1 }, { id: 2 }]);
  });

  it('should not modify the original array', () => {
    const array = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 1, name: 'Alice' },
    ];
    const originalArray = [...array];
    uniqBy(array, 'id');
    expect(array).to.deep.equal(originalArray);
  });

  it('should call iteratee function for each element', () => {
    const array = [{ id: 1 }, { id: 2 }, { id: 1 }];
    const iteratee = sinon.spy((item) => item.id);

    uniqBy(array, iteratee);

    expect(iteratee.calledThrice).to.be.true;
    expect(iteratee.firstCall.returnValue).to.equal(1);
    expect(iteratee.secondCall.returnValue).to.equal(2);
    expect(iteratee.thirdCall.returnValue).to.equal(1);
  });

  it('should work with objects missing the given key', () => {
    const array = [
      { id: 1 },
      { name: 'Alice' }, // missing 'id'
      { id: 2 },
      { id: 1 },
    ];
    const result = uniqBy(array, 'id');
    expect(result).to.deep.equal([{ id: 1 }, { name: 'Alice' }, { id: 2 }]);
  });

  it('should work with an empty iteratee function', () => {
    const array = [{ id: 1 }, { id: 2 }];
    const result = uniqBy(array, () => {});
    expect(result.length).to.equal(1); // Everything maps to `undefined`, so only first is kept
  });

  it('should handle more than 1 duplicate efficiently', () => {
    const largeArray = Array.from({ length: 10000 }, (_, i) => ({ id: i % 100 }));
    const result = uniqBy(largeArray, 'id');
    expect(result.length).to.equal(100);
  });

  it('should return an empty array when array contains only undefined values', () => {
    const array = [undefined, undefined, undefined];
    expect(uniqBy(array, (x) => x)).to.deep.equal([undefined]);
  });
});
