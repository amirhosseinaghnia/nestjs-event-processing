import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { createEventMessageV1 } from '@app/shared';
import { ProcessModule } from '../src/process.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { EventEntity } from '../src/modules/events/event.schema';
import { RuleMatchEntity } from '../src/modules/rule-matches/rule-match.schema';
import { RuleEntity } from '../src/modules/rules/rule.schema';
import { RulesService } from '../src/modules/rules/rules.service';
import { EventProcessorService } from '../src/modules/messaging/event-processor.service';
import { RankingCacheService } from '../src/infrastructure/redis/ranking-cache.service';
import { RabbitMqService } from '../src/infrastructure/messaging/rabbitmq.service';

/**
 * Integration tests spin up MongoDB + Redis via Testcontainers.
 * RabbitMQ is stubbed: event pipeline coverage uses EventProcessorService directly
 * (same business path as the consumer handler) so CI does not depend on heavy broker images.
 */
describe('Process service (e2e)', () => {
  let app: INestApplication;
  let mongo: StartedTestContainer;
  let redis: StartedTestContainer;
  let eventModel: Model<EventEntity>;
  let matchModel: Model<RuleMatchEntity>;
  let ruleModel: Model<RuleEntity>;
  let rulesService: RulesService;
  let processor: EventProcessorService;
  let rankingCache: RankingCacheService;
  let redisClient: Redis;

  jest.setTimeout(180_000);

  beforeAll(async () => {
    [mongo, redis] = await Promise.all([
      new GenericContainer('mongo:latest')
        .withExposedPorts(27017)
        .withStartupTimeout(120_000)
        .withWaitStrategy(Wait.forListeningPorts())
        .start(),
      new GenericContainer('redis:7.4-alpine')
        .withExposedPorts(6379)
        .withStartupTimeout(120_000)
        .withWaitStrategy(Wait.forListeningPorts())
        .start(),
    ]);

    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.MONGODB_URI = `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}/process_test`;
    process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    // Valid URI for config validation; RabbitMqService is overridden below.
    process.env.RABBITMQ_URL = 'amqp://guest:guest@127.0.0.1:5672';
    process.env.RABBITMQ_PREFETCH = '10';
    process.env.LOG_LEVEL = 'error';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ProcessModule],
    })
      .overrideProvider(RabbitMqService)
      .useValue({
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
        consume: async () => undefined,
        ping: async () => true,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    eventModel = app.get(getModelToken(EventEntity.name));
    matchModel = app.get(getModelToken(RuleMatchEntity.name));
    ruleModel = app.get(getModelToken(RuleEntity.name));
    rulesService = app.get(RulesService);
    processor = app.get(EventProcessorService);
    rankingCache = app.get(RankingCacheService);
    redisClient = new Redis(process.env.REDIS_URL);
  });

  afterAll(async () => {
    await redisClient?.quit();
    await app?.close();
    await Promise.all([mongo?.stop(), redis?.stop()]);
  });

  beforeEach(async () => {
    await Promise.all([
      eventModel.deleteMany({}),
      matchModel.deleteMany({}),
      ruleModel.deleteMany({}),
      redisClient.flushdb(),
    ]);
    rulesService.invalidateCache();
  });

  async function createRule(
    body: Record<string, unknown> = {
      eventName: 'temperature',
      operator: '>',
      threshold: 80,
    },
  ) {
    const res = await request(app.getHttpServer())
      .post('/rules')
      .send(body)
      .expect(201);
    return res.body as { _id: string; eventName: string; threshold: number };
  }

  describe('Rules CRUD', () => {
    it('creates, lists (paginated), updates and deletes rules', async () => {
      const created = await createRule();

      const listed = await request(app.getHttpServer())
        .get('/rules?page=1&limit=10')
        .expect(200);

      expect(listed.body.total).toBe(1);
      expect(listed.body.data[0]._id).toBe(created._id);

      const updated = await request(app.getHttpServer())
        .patch(`/rules/${created._id}`)
        .send({ threshold: 100 })
        .expect(200);

      expect(updated.body.threshold).toBe(100);

      await request(app.getHttpServer())
        .delete(`/rules/${created._id}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/rules/${created._id}`)
        .expect(404);
    });
  });

  describe('Event processing', () => {
    it('stores event and creates matches for one/multiple rules', async () => {
      const ruleA = await createRule({
        eventName: 'temperature',
        operator: '>',
        threshold: 80,
      });
      const ruleB = await createRule({
        eventName: 'temperature',
        operator: '>=',
        threshold: 85,
      });

      const message = createEventMessageV1({
        eventId: uuidv4(),
        agentId: 'agent-1',
        name: 'temperature',
        value: 90,
      });

      await processor.processEvent(message);

      const events = await eventModel.find({ eventId: message.eventId });
      expect(events).toHaveLength(1);

      const matches = await matchModel.find({ eventId: message.eventId });
      expect(matches).toHaveLength(2);
      expect(matches.map((m) => m.ruleId.toString()).sort()).toEqual(
        [ruleA._id, ruleB._id].sort(),
      );

      const rankings = await request(app.getHttpServer())
        .get(`/reports/rules/${ruleA._id}/agent-rankings`)
        .expect(200);

      expect(rankings.body).toEqual([{ agentId: 'agent-1', count: 1 }]);
    });

    it('does not match when no rules apply', async () => {
      await createRule({
        eventName: 'temperature',
        operator: '>',
        threshold: 80,
      });

      const message = createEventMessageV1({
        eventId: uuidv4(),
        agentId: 'agent-1',
        name: 'temperature',
        value: 10,
      });

      await processor.processEvent(message);
      expect(await matchModel.countDocuments()).toBe(0);
    });

    it('does not retroactively apply a rule created after an old event', async () => {
      const message = createEventMessageV1({
        eventId: uuidv4(),
        agentId: 'agent-1',
        name: 'temperature',
        value: 99,
      });
      await processor.processEvent(message);

      await createRule({
        eventName: 'temperature',
        operator: '>',
        threshold: 80,
      });

      expect(await matchModel.countDocuments()).toBe(0);
    });

    it('keeps historical snapshots after rule edit and supports reports after delete', async () => {
      const rule = await createRule({
        eventName: 'temperature',
        operator: '>',
        threshold: 80,
      });

      const first = createEventMessageV1({
        eventId: uuidv4(),
        agentId: 'agent-1',
        name: 'temperature',
        value: 85,
      });
      await processor.processEvent(first);

      expect(
        await matchModel.countDocuments({
          ruleId: new Types.ObjectId(rule._id),
        }),
      ).toBe(1);

      await request(app.getHttpServer())
        .patch(`/rules/${rule._id}`)
        .send({ threshold: 100 })
        .expect(200);

      const second = createEventMessageV1({
        eventId: uuidv4(),
        agentId: 'agent-1',
        name: 'temperature',
        value: 90,
      });
      await processor.processEvent(second);

      const matches = await matchModel
        .find({ ruleId: new Types.ObjectId(rule._id) })
        .lean();
      expect(matches).toHaveLength(1);
      expect(matches[0].ruleSnapshot.threshold).toBe(80);

      await request(app.getHttpServer())
        .delete(`/rules/${rule._id}`)
        .expect(204);

      const from = new Date(Date.now() - 60_000).toISOString();
      const to = new Date(Date.now() + 60_000).toISOString();

      const occurrences = await request(app.getHttpServer())
        .get(`/reports/rules/${rule._id}/occurrences`)
        .query({ from, to })
        .expect(200);

      expect(occurrences.body[0].agentId).toBe('agent-1');
      expect(occurrences.body[0].timestamps).toHaveLength(1);

      const rankings = await request(app.getHttpServer())
        .get(`/reports/rules/${rule._id}/agent-rankings`)
        .expect(200);

      expect(rankings.body).toEqual([{ agentId: 'agent-1', count: 1 }]);
    });

    it('handles duplicate event delivery without double-counting', async () => {
      const rule = await createRule();
      const message = createEventMessageV1({
        eventId: uuidv4(),
        agentId: 'agent-2',
        name: 'temperature',
        value: 95,
      });

      await processor.processEvent(message);
      await processor.processEvent(message);

      expect(
        await eventModel.countDocuments({ eventId: message.eventId }),
      ).toBe(1);
      expect(
        await matchModel.countDocuments({ eventId: message.eventId }),
      ).toBe(1);

      const rankings = await rankingCache.getRankings(rule._id);
      expect(rankings).toEqual([{ agentId: 'agent-2', count: 1 }]);
    });
  });

  describe('Reports', () => {
    it('rejects ranges greater than one day and returns empty rankings', async () => {
      const rule = await createRule();

      await request(app.getHttpServer())
        .get(`/reports/rules/${rule._id}/occurrences`)
        .query({
          from: '2026-10-08T00:00:00.000Z',
          to: '2026-10-09T00:00:00.001Z',
        })
        .expect(400);

      const rankings = await request(app.getHttpServer())
        .get(`/reports/rules/${rule._id}/agent-rankings`)
        .expect(200);

      expect(rankings.body).toEqual([]);
    });

    it('rebuilds rankings from MongoDB after Redis flush', async () => {
      const rule = await createRule();
      const message = createEventMessageV1({
        eventId: uuidv4(),
        agentId: 'agent-3',
        name: 'temperature',
        value: 100,
      });
      await processor.processEvent(message);

      await redisClient.flushdb();

      const rankings = await request(app.getHttpServer())
        .get(`/reports/rules/${rule._id}/agent-rankings`)
        .expect(200);

      expect(rankings.body).toEqual([{ agentId: 'agent-3', count: 1 }]);

      const cached = await rankingCache.getRankings(rule._id);
      expect(cached).toEqual([{ agentId: 'agent-3', count: 1 }]);
    });

    it('groups occurrence timestamps by agent within one day', async () => {
      const rule = await createRule();
      const t1 = new Date('2026-10-08T10:00:00.000Z');
      const t2 = new Date('2026-10-08T11:00:00.000Z');

      await processor.processEvent(
        createEventMessageV1({
          eventId: uuidv4(),
          agentId: 'agent-1',
          name: 'temperature',
          value: 90,
          occurredAt: t1,
        }),
      );
      await processor.processEvent(
        createEventMessageV1({
          eventId: uuidv4(),
          agentId: 'agent-2',
          name: 'temperature',
          value: 91,
          occurredAt: t2,
        }),
      );

      const res = await request(app.getHttpServer())
        .get(`/reports/rules/${rule._id}/occurrences`)
        .query({
          from: '2026-10-08T00:00:00.000Z',
          to: '2026-10-08T23:59:59.999Z',
        })
        .expect(200);

      expect(res.body).toEqual(
        expect.arrayContaining([
          {
            agentId: 'agent-1',
            timestamps: [t1.toISOString()],
          },
          {
            agentId: 'agent-2',
            timestamps: [t2.toISOString()],
          },
        ]),
      );
    });
  });
});
