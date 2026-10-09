import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RuleMatchEntity, RuleMatchSchema } from './rule-match.schema';
import { RuleMatchesService } from './rule-matches.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RuleMatchEntity.name, schema: RuleMatchSchema },
    ]),
  ],
  providers: [RuleMatchesService],
  exports: [RuleMatchesService, MongooseModule],
})
export class RuleMatchesModule {}
