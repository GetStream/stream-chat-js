import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';

import { generateMsg } from './test-utils/generateMessage';

import { addToMessageList, formatMessage } from '../../src/utils';

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
