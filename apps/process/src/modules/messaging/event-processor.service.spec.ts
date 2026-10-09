import { EventMessageV1 } from '@app/shared';
import { EventProcessorService } from './event-processor.service';

describe('EventProcessorService idempotency', () => {
  const message: EventMessageV1 = {
    schemaVersion: 1,
    eventId: 'evt-1',
    agentId: 'agent-1',
    name: 'temperature',
    value: 90,
    occurredAt: '2026-10-08T10:00:00.000Z',
  };

  function createService(overrides: {
    alreadyCompleted?: boolean;
    rules?: Array<{
      _id: { toString(): string };
      eventName: string;
      operator: '>' | '<' | '=' | '<=' | '>=';
      threshold: number;
    }>;
    tryCreateResults?: boolean[];
  }) {
    const eventsService = {
      upsertFromMessage: jest.fn().mockResolvedValue({
        event: { occurredAt: new Date(message.occurredAt) },
        isNew: !overrides.alreadyCompleted,
        alreadyCompleted: overrides.alreadyCompleted ?? false,
      }),
      markCompleted: jest.fn().mockResolvedValue(undefined),
    };

    const rules = overrides.rules ?? [
      {
        _id: { toString: () => 'rule-1' },
        eventName: 'temperature',
        operator: '>' as const,
        threshold: 80,
      },
    ];

    const rulesService = {
      getActiveRules: jest.fn().mockResolvedValue(rules),
    };

    let createIdx = 0;
    const ruleMatchesService = {
      tryCreate: jest.fn().mockImplementation(() => {
        const results = overrides.tryCreateResults ?? [true];
        const value = results[createIdx] ?? false;
        createIdx += 1;
        return Promise.resolve(value);
      }),
    };

    const rankingCache = {
      increment: jest.fn().mockResolvedValue(undefined),
    };

    const rabbitMq = { consume: jest.fn() };

    const service = new EventProcessorService(
      rabbitMq as never,
      eventsService as never,
      rulesService as never,
      ruleMatchesService as never,
      rankingCache as never,
    );

    return { service, eventsService, ruleMatchesService, rankingCache };
  }

  it('short-circuits when event was already fully processed', async () => {
    const { service, ruleMatchesService, rankingCache } = createService({
      alreadyCompleted: true,
    });

    await service.processEvent(message);

    expect(ruleMatchesService.tryCreate).not.toHaveBeenCalled();
    expect(rankingCache.increment).not.toHaveBeenCalled();
  });

  it('increments Redis only when a new match document is created', async () => {
    const { service, rankingCache } = createService({
      tryCreateResults: [true],
    });

    await service.processEvent(message);

    expect(rankingCache.increment).toHaveBeenCalledTimes(1);
    expect(rankingCache.increment).toHaveBeenCalledWith('rule-1', 'agent-1');
  });

  it('does not increment Redis for duplicate match inserts', async () => {
    const { service, rankingCache } = createService({
      tryCreateResults: [false],
    });

    await service.processEvent(message);

    expect(rankingCache.increment).not.toHaveBeenCalled();
  });

  it('creates multiple matches for one event', async () => {
    const { service, ruleMatchesService, rankingCache } = createService({
      rules: [
        {
          _id: { toString: () => 'rule-1' },
          eventName: 'temperature',
          operator: '>',
          threshold: 80,
        },
        {
          _id: { toString: () => 'rule-2' },
          eventName: 'temperature',
          operator: '>=',
          threshold: 90,
        },
      ],
      tryCreateResults: [true, true],
    });

    await service.processEvent(message);

    expect(ruleMatchesService.tryCreate).toHaveBeenCalledTimes(2);
    expect(rankingCache.increment).toHaveBeenCalledTimes(2);
  });

  it('stores immutable rule snapshot on match', async () => {
    const { service, ruleMatchesService } = createService({});

    await service.processEvent(message);

    expect(ruleMatchesService.tryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleSnapshot: {
          eventName: 'temperature',
          operator: '>',
          threshold: 80,
        },
      }),
    );
  });
});
