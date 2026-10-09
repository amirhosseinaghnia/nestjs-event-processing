import { Module } from '@nestjs/common';
import { EventPublisherService } from './messaging/event-publisher.service';
import { EventGeneratorService } from './generator/event-generator.service';

@Module({
  providers: [EventPublisherService, EventGeneratorService],
})
export class AgentModule {}
