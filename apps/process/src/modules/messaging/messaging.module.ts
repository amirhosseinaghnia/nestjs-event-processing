import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { RuleMatchesModule } from '../rule-matches/rule-matches.module';
import { RulesModule } from '../rules/rules.module';
import { EventProcessorService } from './event-processor.service';

@Module({
  imports: [EventsModule, RulesModule, RuleMatchesModule],
  providers: [EventProcessorService],
  exports: [EventProcessorService],
})
export class MessagingModule {}
