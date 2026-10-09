import { DateRangeError, parseAndValidateDateRange } from './date-range';

describe('parseAndValidateDateRange', () => {
  it('accepts a range of exactly one day', () => {
    const { from, to } = parseAndValidateDateRange(
      '2026-10-08T00:00:00.000Z',
      '2026-10-09T00:00:00.000Z',
    );
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('rejects ranges greater than one day', () => {
    expect(() =>
      parseAndValidateDateRange(
        '2026-10-08T00:00:00.000Z',
        '2026-10-09T00:00:00.001Z',
      ),
    ).toThrow(DateRangeError);
  });

  it('rejects inverted ranges', () => {
    expect(() =>
      parseAndValidateDateRange(
        '2026-10-09T00:00:00.000Z',
        '2026-10-08T00:00:00.000Z',
      ),
    ).toThrow(/less than or equal/);
  });

  it('rejects invalid timestamps', () => {
    expect(() => parseAndValidateDateRange('not-a-date', 'also-bad')).toThrow(
      DateRangeError,
    );
  });
});
