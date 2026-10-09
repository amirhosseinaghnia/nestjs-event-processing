export const EVENT_NAMES = [
  'temperature',
  'speed',
  'pressure',
  'voltage',
  'noise',
  'light_intensity',
  'humidity',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];
