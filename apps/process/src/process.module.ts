import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { loadProcessConfig } from './common/config/process.config';
import { MessagingInfrastructureModule } from './infrastructure/messaging/messaging.module';
import { RedisInfrastructureModule } from './infrastructure/redis/redis.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { RuleMatchesModule } from './modules/rule-matches/rule-matches.module';
import { RulesModule } from './modules/rules/rules.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    MongooseModule.forRootAsync({
      useFactory: () => {
        const config = loadProcessConfig();
        return { uri: config.mongodbUri };
      },
    }),
    RedisInfrastructureModule,
    MessagingInfrastructureModule,
    EventsModule,
    RulesModule,
    RuleMatchesModule,
    MessagingModule,
    ReportingModule,
    HealthModule,
  ],
})
export class ProcessModule {}
