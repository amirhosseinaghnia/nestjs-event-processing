const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class DateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateRangeError';
  }
}

export function parseAndValidateDateRange(
  fromRaw: string,
  toRaw: string,
): { from: Date; to: Date } {
  const from = new Date(fromRaw);
  const to = new Date(toRaw);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new DateRangeError('from and to must be valid ISO-8601 timestamps');
  }

  if (from.getTime() > to.getTime()) {
    throw new DateRangeError('from must be less than or equal to to');
  }

  if (to.getTime() - from.getTime() > ONE_DAY_MS) {
    throw new DateRangeError('time range must not exceed 1 day');
  }

  return { from, to };
}
