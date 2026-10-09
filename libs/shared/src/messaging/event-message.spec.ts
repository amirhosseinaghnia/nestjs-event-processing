import { createEventMessageV1, isEventMessageV1 } from './event-message';

describe('EventMessageV1', () => {
  it('accepts a valid message', () => {
    const msg = createEventMessageV1({
      eventId: 'id-1',
      agentId: 'agent-1',
      name: 'temperature',
      value: 42,
    });
    expect(isEventMessageV1(msg)).toBe(true);
  });

  it('rejects invalid payloads', () => {
    expect(isEventMessageV1(null)).toBe(false);
    expect(isEventMessageV1({ schemaVersion: 1 })).toBe(false);
    expect(
      isEventMessageV1({
        schemaVersion: 1,
        eventId: 'x',
        agentId: 'a',
        name: 'temperature',
        value: Number.NaN,
        occurredAt: '2026-10-08T00:00:00.000Z',
      }),
    ).toBe(false);
  });
});
