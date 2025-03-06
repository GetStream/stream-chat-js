import { expect } from 'chai';
import sinon from 'sinon';
import { StreamChat } from '../../src';

const user1 = {
  id: 'user1',
  role: 'user',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  name: 'Test User 1',
};

const reminderResponse = {
  id: 'reminder1',
  remind_at: '2025-04-12T23:20:50.52Z',
  user_id: user1.id,
  user: user1,
  channel_cid: 'messaging:123',
  message_id: 'message123',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

describe('Reminder', () => {
  let client;

  beforeEach(() => {
    client = new StreamChat('api_key');
    client.user = user1;
    client.userID = user1.id;
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('createReminder', () => {
    it('should create a reminder successfully', async () => {
      const postStub = sinon.stub(client, 'post').resolves(reminderResponse);

      const result = await client.createReminder('message123', {
        remind_at: '2025-04-12T23:20:50.52Z',
      });

      expect(postStub.calledOnce).to.be.true;
      expect(postStub.firstCall.args[0]).to.equal(`${client.baseURL}/messages/message123/reminders`);
      expect(postStub.firstCall.args[1]).to.deep.equal({
        remind_at: '2025-04-12T23:20:50.52Z',
      });
      expect(result).to.deep.equal(reminderResponse);
    });

    it('should create a reminder without remind_at', async () => {
      const postStub = sinon.stub(client, 'post').resolves(reminderResponse);

      await client.createReminder('message123');

      expect(postStub.calledOnce).to.be.true;
      expect(postStub.firstCall.args[1]).to.deep.equal({});
    });

    it('should create a reminder with null remind_at', async () => {
      const reminderWithNullDate = {
        ...reminderResponse,
        remind_at: null
      };
      const postStub = sinon.stub(client, 'post').resolves(reminderWithNullDate);

      const result = await client.createReminder('message123', {
        remind_at: null
      });

      expect(postStub.calledOnce).to.be.true;
      expect(postStub.firstCall.args[0]).to.equal(`${client.baseURL}/messages/message123/reminders`);
      expect(postStub.firstCall.args[1]).to.deep.equal({
        remind_at: null
      });
      expect(result).to.deep.equal(reminderWithNullDate);
    });

    it('should create a reminder with undefined remind_at', async () => {
      const reminderWithoutDate = {
        ...reminderResponse,
        remind_at: undefined
      };
      const postStub = sinon.stub(client, 'post').resolves(reminderWithoutDate);

      const result = await client.createReminder('message123', {
        remind_at: undefined
      });

      expect(postStub.calledOnce).to.be.true;
      expect(postStub.firstCall.args[0]).to.equal(`${client.baseURL}/messages/message123/reminders`);
      expect(postStub.firstCall.args[1]).to.deep.equal({
        remind_at: undefined
      });
      expect(result).to.deep.equal(reminderWithoutDate);
    });
  });

  describe('updateReminder', () => {
    it('should update a reminder successfully', async () => {
      const updatedReminder = {
        ...reminderResponse,
        remind_at: '2025-05-12T23:20:50.52Z',
      };
      const putStub = sinon.stub(client, 'put').resolves(updatedReminder);

      const result = await client.updateReminder('message123', {
        remind_at: '2025-05-12T23:20:50.52Z',
      });

      expect(putStub.calledOnce).to.be.true;
      expect(putStub.firstCall.args[0]).to.equal(`${client.baseURL}/messages/message123/reminders`);
      expect(putStub.firstCall.args[1]).to.deep.equal({
        remind_at: '2025-05-12T23:20:50.52Z',
      });
      expect(result).to.deep.equal(updatedReminder);
    });

    it('should update a reminder to remove remind_at', async () => {
      const updatedReminder = {
        ...reminderResponse,
        remind_at: null
      };
      const putStub = sinon.stub(client, 'put').resolves(updatedReminder);

      const result = await client.updateReminder('message123', {
        remind_at: null
      });

      expect(putStub.calledOnce).to.be.true;
      expect(putStub.firstCall.args[0]).to.equal(`${client.baseURL}/messages/message123/reminders`);
      expect(putStub.firstCall.args[1]).to.deep.equal({
        remind_at: null
      });
      expect(result).to.deep.equal(updatedReminder);
    });

    it('should update a reminder with undefined remind_at', async () => {
      const updatedReminder = {
        ...reminderResponse,
        remind_at: undefined
      };
      const putStub = sinon.stub(client, 'put').resolves(updatedReminder);

      const result = await client.updateReminder('message123', {
        remind_at: undefined
      });

      expect(putStub.calledOnce).to.be.true;
      expect(putStub.firstCall.args[0]).to.equal(`${client.baseURL}/messages/message123/reminders`);
      expect(putStub.firstCall.args[1]).to.deep.equal({
        remind_at: undefined
      });
      expect(result).to.deep.equal(updatedReminder);
    });
  });

  describe('deleteReminder', () => {
    it('should delete a reminder successfully', async () => {
      const deleteStub = sinon.stub(client, 'delete').resolves({});

      await client.deleteReminder('message123');

      expect(deleteStub.calledOnce).to.be.true;
      expect(deleteStub.firstCall.args[0]).to.equal(`${client.baseURL}/messages/message123/reminders`);
      expect(deleteStub.firstCall.args[1]).to.deep.equal({});
    });

    it('should delete a reminder with user_id', async () => {
      const deleteStub = sinon.stub(client, 'delete').resolves({});

      await client.deleteReminder('message123', 'user1');

      expect(deleteStub.calledOnce).to.be.true;
      expect(deleteStub.firstCall.args[1]).to.deep.equal({ user_id: 'user1' });
    });
  });

  describe('queryReminders', () => {
    it('should query reminders successfully', async () => {
      const queryResponse = {
        reminders: [reminderResponse],
        next: 'next_page_token',
      };
      const postStub = sinon.stub(client, 'post').resolves(queryResponse);

      const result = await client.queryReminders({
        filter_conditions: {
          channel_cid: 'messaging:123',
          remind_at: { $gt: '2024-01-01T00:00:00.000Z' },
        },
        sort: [{ field: 'remind_at', direction: 1 }],
        limit: 10,
      });

      expect(postStub.calledOnce).to.be.true;
      expect(postStub.firstCall.args[0]).to.equal(`${client.baseURL}/reminders/query`);
      expect(postStub.firstCall.args[1]).to.deep.equal({
        filter_conditions: {
          channel_cid: 'messaging:123',
          remind_at: { $gt: '2024-01-01T00:00:00.000Z' },
        },
        sort: [{ field: 'remind_at', direction: 1 }],
        limit: 10,
      });
      expect(result).to.deep.equal(queryResponse);
    });

    it('should query reminders with empty options', async () => {
      const queryResponse = { reminders: [] };
      const postStub = sinon.stub(client, 'post').resolves(queryResponse);

      const result = await client.queryReminders();

      expect(postStub.calledOnce).to.be.true;
      expect(postStub.firstCall.args[1]).to.deep.equal({});
      expect(result).to.deep.equal(queryResponse);
    });
  });

  describe('Reminder Events', () => {
    it('should handle reminder.created event', () => {
      const eventHandler = sinon.spy();
      client.on('reminder.created', eventHandler);

      const reminderEvent = {
        type: 'reminder.created',
        reminder: reminderResponse,
      };

      client.dispatchEvent(reminderEvent);

      expect(eventHandler.calledOnce).to.be.true;
      expect(eventHandler.firstCall.args[0]).to.deep.equal(reminderEvent);
    });

    it('should handle reminder.updated event', () => {
      const eventHandler = sinon.spy();
      client.on('reminder.updated', eventHandler);

      const reminderEvent = {
        type: 'reminder.updated',
        reminder: {
          ...reminderResponse,
          remind_at: '2025-05-12T23:20:50.52Z',
        },
      };

      client.dispatchEvent(reminderEvent);

      expect(eventHandler.calledOnce).to.be.true;
      expect(eventHandler.firstCall.args[0]).to.deep.equal(reminderEvent);
    });

    it('should handle reminder.deleted event', () => {
      const eventHandler = sinon.spy();
      client.on('reminder.deleted', eventHandler);

      const reminderEvent = {
        type: 'reminder.deleted',
        reminder: reminderResponse,
      };

      client.dispatchEvent(reminderEvent);

      expect(eventHandler.calledOnce).to.be.true;
      expect(eventHandler.firstCall.args[0]).to.deep.equal(reminderEvent);
    });

    it('should handle notification.reminder_due event', () => {
      const eventHandler = sinon.spy();
      client.on('notification.reminder_due', eventHandler);

      const reminderEvent = {
        type: 'notification.reminder_due',
        reminder: reminderResponse,
      };

      client.dispatchEvent(reminderEvent);

      expect(eventHandler.calledOnce).to.be.true;
      expect(eventHandler.firstCall.args[0]).to.deep.equal(reminderEvent);
    });
  });
}); 