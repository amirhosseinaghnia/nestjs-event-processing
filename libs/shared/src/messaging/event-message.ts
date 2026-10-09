import { EVENT_MESSAGE_SCHEMA_VERSION } from './constants';

export interface EventMessageV1 {
  schemaVersion: typeof EVENT_MESSAGE_SCHEMA_VERSION;
  eventId: string;
  agentId: string;
  name: string;
  value: number;
  occurredAt: string;
}

export function isEventMessageV1(value: unknown): value is EventMessageV1 {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const msg = value as Record<string, unknown>;

  return (
    msg.schemaVersion === EVENT_MESSAGE_SCHEMA_VERSION &&
    typeof msg.eventId === 'string' &&
    msg.eventId.length > 0 &&
    typeof msg.agentId === 'string' &&
    msg.agentId.length > 0 &&
    typeof msg.name === 'string' &&
    msg.name.length > 0 &&
    typeof msg.value === 'number' &&
    Number.isFinite(msg.value) &&
    typeof msg.occurredAt === 'string' &&
    !Number.isNaN(Date.parse(msg.occurredAt))
  );
}

export function createEventMessageV1(input: {
  eventId: string;
  agentId: string;
  name: string;
  value: number;
  occurredAt?: Date;
}): EventMessageV1 {
  return {
    schemaVersion: EVENT_MESSAGE_SCHEMA_VERSION,
    eventId: input.eventId,
    agentId: input.agentId,
    name: input.name,
    value: input.value,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
  };
}
