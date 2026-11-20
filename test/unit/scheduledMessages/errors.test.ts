import { describe, expect, it } from 'vitest';
import {
  getScheduledMessageErrorReason,
  isScheduledMessageError,
  isScheduledMessageNotFoundError,
  ScheduledMessageErrorReason,
} from '../../../src';
import { generateAPIError } from '../test-utils/generateAPIError';

describe('scheduled message errors', () => {
  it('reads the reason from the exception fields', () => {
    const error = generateAPIError(4, ScheduledMessageErrorReason.TooSoon);

    expect(getScheduledMessageErrorReason(error)).toBe(
      ScheduledMessageErrorReason.TooSoon,
    );
  });

  it.each([
    [114, ScheduledMessageErrorReason.Disabled],
    [115, ScheduledMessageErrorReason.TooSoon],
    [116, ScheduledMessageErrorReason.TooFar],
    [117, ScheduledMessageErrorReason.ChannelLimit],
    [118, ScheduledMessageErrorReason.UserLimit],
    [119, ScheduledMessageErrorReason.IdTaken],
    [120, ScheduledMessageErrorReason.NotEditable],
    [121, ScheduledMessageErrorReason.Sending],
    [122, ScheduledMessageErrorReason.Conflict],
    [123, ScheduledMessageErrorReason.AlreadySent],
    [124, ScheduledMessageErrorReason.Canceled],
  ])('maps error code %i to %s without a reason', (code, reason) => {
    expect(getScheduledMessageErrorReason(generateAPIError(code))).toBe(reason);
  });

  it('ignores an unknown reason and falls back to the error code', () => {
    const error = generateAPIError(116, 'something_else');

    expect(getScheduledMessageErrorReason(error)).toBe(
      ScheduledMessageErrorReason.TooFar,
    );
  });

  it('returns undefined for errors that do not come from the API', () => {
    expect(getScheduledMessageErrorReason(new Error('offline'))).toBeUndefined();
    expect(getScheduledMessageErrorReason(undefined)).toBeUndefined();
  });

  it('matches one reason', () => {
    const error = generateAPIError(119);

    expect(isScheduledMessageError(error, ScheduledMessageErrorReason.IdTaken)).toBe(
      true,
    );
    expect(isScheduledMessageError(error, ScheduledMessageErrorReason.TooSoon)).toBe(
      false,
    );
  });

  it('recognises a scheduled message that no longer exists', () => {
    expect(isScheduledMessageNotFoundError(generateAPIError(16, undefined, 404))).toBe(
      true,
    );
    expect(isScheduledMessageNotFoundError(generateAPIError(16))).toBe(false);
    expect(isScheduledMessageNotFoundError(new Error('offline'))).toBe(false);
  });
});
