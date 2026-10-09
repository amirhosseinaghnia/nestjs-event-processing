import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';
import {
  EventMessageV1,
  findMatchingRules,
  isEventMessageV1,
} from '@app/shared';
import { RankingCacheService } from '../../infrastructure/redis/ranking-cache.service';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service';
import { EventsService } from '../events/events.service';
import { RuleMatchesService } from '../rule-matches/rule-matches.service';
import { RulesService } from '../rules/rules.service';

@Injectable()
export class EventProcessorService implements OnModuleInit {
  private readonly logger = new Logger(EventProcessorService.name);

  constructor(
    private readonly rabbitMq: RabbitMqService,
    private readonly eventsService: EventsService,
    private readonly rulesService: RulesService,
    private readonly ruleMatchesService: RuleMatchesService,
    private readonly rankingCache: RankingCacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitMq.consume((msg) => this.processMessage(msg));
  }

  async processMessage(msg: ConsumeMessage): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(msg.content.toString('utf8'));
    } catch {
      const error = new Error('Invalid event payload: malformed JSON');
      error.name = 'ValidationError';
      throw error;
    }

    if (!isEventMessageV1(payload)) {
      const error = new Error(
        'Invalid event payload: schema validation failed',
      );
      error.name = 'ValidationError';
      throw error;
    }

    await this.processEvent(payload);
  }

  async processEvent(message: EventMessageV1): Promise<void> {
    const { event, alreadyCompleted } =
      await this.eventsService.upsertFromMessage(message);

    if (alreadyCompleted) {
      this.logger.debug(
        `Duplicate completed eventId=${message.eventId}; acknowledging`,
      );
      return;
    }

    const rules = await this.rulesService.getActiveRules();
    const matching = findMatchingRules(message.name, message.value, rules);

    for (const rule of matching) {
      const ruleId = rule._id.toString();
      const created = await this.ruleMatchesService.tryCreate({
        eventId: message.eventId,
        agentId: message.agentId,
        ruleId,
        eventName: message.name,
        eventValue: message.value,
        occurredAt: event.occurredAt,
        ruleSnapshot: {
          eventName: rule.eventName,
          operator: rule.operator,
          threshold: rule.threshold,
        },
      });

      if (created) {
        await this.rankingCache.increment(ruleId, message.agentId);
        this.logger.debug(
          `Match created eventId=${message.eventId} ruleId=${ruleId}`,
        );
      }
    }

    await this.eventsService.markCompleted(message.eventId);
  }
}
