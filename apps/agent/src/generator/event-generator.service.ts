import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { faker } from '@faker-js/faker';
import { v4 as uuidv4 } from 'uuid';
import { EVENT_NAMES, createEventMessageV1, EventName } from '@app/shared';
import { loadAgentConfig } from '../config/agent.config';
import { EventPublisherService } from '../messaging/event-publisher.service';

const VALUE_RANGES: Record<
  EventName,
  { min: number; max: number; decimals: number }
> = {
  temperature: { min: -20, max: 120, decimals: 1 },
  speed: { min: 0, max: 200, decimals: 1 },
  pressure: { min: 900, max: 1100, decimals: 1 },
  voltage: { min: 0, max: 480, decimals: 2 },
  noise: { min: 20, max: 120, decimals: 1 },
  light_intensity: { min: 0, max: 100000, decimals: 0 },
  humidity: { min: 0, max: 100, decimals: 1 },
};

@Injectable()
export class EventGeneratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventGeneratorService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly agentId: string;
  private readonly intervalMs: number;
  private publishing = false;

  constructor(private readonly publisher: EventPublisherService) {
    const config = loadAgentConfig();
    this.agentId = config.agentId;
    this.intervalMs = Math.max(1, Math.round(1000 / config.eventRatePerSec));
  }

  onModuleInit(): void {
    this.logger.log(
      `Starting event generation for agent=${this.agentId} every ${this.intervalMs}ms`,
    );
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  private async tick(): Promise<void> {
    if (this.publishing) {
      return;
    }
    this.publishing = true;
    try {
      const name = faker.helpers.arrayElement([...EVENT_NAMES]);
      const range = VALUE_RANGES[name];
      const value = Number(
        faker.number
          .float({
            min: range.min,
            max: range.max,
            fractionDigits: range.decimals,
          })
          .toFixed(range.decimals),
      );

      const message = createEventMessageV1({
        eventId: uuidv4(),
        agentId: this.agentId,
        name,
        value,
      });

      await this.publisher.publish(message);
      this.logger.debug(
        `Published eventId=${message.eventId} name=${name} value=${value}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to publish event: ${err.message}`);
    } finally {
      this.publishing = false;
    }
  }

  onModuleDestroy(): void {
    this.logger.log('Stopping event generation');
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
