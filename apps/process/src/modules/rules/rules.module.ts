import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RuleEntity, RuleSchema } from './rule.schema';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RuleEntity.name, schema: RuleSchema }]),
  ],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService, MongooseModule],
})
export class RulesModule {}
