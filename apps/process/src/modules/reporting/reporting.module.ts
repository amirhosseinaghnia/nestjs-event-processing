import { Module } from '@nestjs/common';
import { RuleMatchesModule } from '../rule-matches/rule-matches.module';
import { RulesModule } from '../rules/rules.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [RulesModule, RuleMatchesModule],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
