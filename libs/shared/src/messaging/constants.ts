export const MESSAGING = {
  EXCHANGE: 'agent.events',
  ROUTING_KEY: 'event.created',
  QUEUE: 'process.events',
  DLQ: 'process.events.dlq',
  DLX: 'agent.events.dlx',
  PREFETCH_DEFAULT: 10,
} as const;

export const EVENT_MESSAGE_SCHEMA_VERSION = 1 as const;
