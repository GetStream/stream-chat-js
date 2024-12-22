import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';

import { generateMsg } from './test-utils/generateMessage';

import { addToMessageList, findIndexInSortedArray, formatMessage } from '../../src/utils';

import type { FormatMessageResponse, MessageResponse } from '../../src';

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
