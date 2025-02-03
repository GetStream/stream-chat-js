import { expect } from 'chai';
import sinon from 'sinon';
import { v4 as uuidv4 } from 'uuid';

import { generateMsg } from './test-utils/generateMessage';
import { generateChannel } from './test-utils/generateChannel';
import { getClientWithUser } from './test-utils/getClient';

import { getAndWatchChannel, addToMessageList, findIndexInSortedArray, formatMessage } from '../../src/utils';

import type { ChannelResponse, FormatMessageResponse, MessageResponse } from '../../src';
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

    const mockedChannelsQueryResponse = Array.from({ length: 2 }, () => generateChannel());
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

  it('should create a new channel if only type and id are provided', async () => {
    const channels = await client.queryChannels({});
    const channel = channels[0];
    const { id, type } = channel;
    const watchStub = sandbox.stub(channel, 'watch');
    const channelSpy = sandbox.spy(client, 'channel');
    const result = await getAndWatchChannel({
      client,
      type,
      id,
      members: [],
      options: {},
    });

    expect(channelSpy.calledOnce).to.be.true;
    // @ts-ignore
    expect(channelSpy.calledWith(type, id, { members: [] })).to.be.true;
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
