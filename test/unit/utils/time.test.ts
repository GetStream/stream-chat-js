import { describe, expect, it } from 'vitest';

import { msToNs, nsToDate, nsToMs, nsToRfc3339 } from '../../../src/utils/time';

describe('nsToRfc3339', () => {
  /** A real on-device value, whose sub-millisecond remainder is non-zero. */
  const NANOS = 1786219962651957000;

  it('emits nine fractional digits', () => {
    expect(nsToRfc3339(NANOS)).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:]{8}\.\d{9}Z$/);
  });

  it('keeps the sub-millisecond part that nsToDate discards', () => {
    const emitted = nsToRfc3339(NANOS);
    const viaDate = nsToDate(NANOS).toISOString();

    expect(emitted.slice(0, 23)).toBe(viaDate.slice(0, 23));
    expect(emitted.slice(23, 29)).toBe(
      String(NANOS - nsToMs(NANOS) * 1e6).padStart(6, '0'),
    );
    expect(emitted).not.toBe(viaDate);
  });

  it('round-trips a whole-millisecond value identically to nsToDate', () => {
    const exactMs = msToNs(Date.parse('2026-01-02T03:04:05.678Z'));

    expect(nsToRfc3339(exactMs)).toBe('2026-01-02T03:04:05.678000000Z');
    expect(nsToRfc3339(exactMs).slice(0, 23)).toBe(
      nsToDate(exactMs).toISOString().slice(0, 23),
    );
  });

  it('pads a small remainder rather than truncating it', () => {
    const oneNsPast = msToNs(Date.parse('2026-01-02T03:04:05.678Z')) + 1;

    // The double cannot hold a 1 ns step here, so assert the shape, not an exact digit.
    expect(nsToRfc3339(oneNsPast)).toMatch(/\.678\d{6}Z$/);
  });

  it('handles the epoch', () => {
    expect(nsToRfc3339(0)).toBe('1970-01-01T00:00:00.000000000Z');
  });
});
