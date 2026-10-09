import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ComparisonOperator } from '@app/shared';

export type RuleMatchDocument = HydratedDocument<RuleMatchEntity>;

export interface RuleSnapshot {
  eventName: string;
  operator: ComparisonOperator;
  threshold: number;
}

@Schema({
  collection: 'rule_matches',
  timestamps: { createdAt: true, updatedAt: false },
})
export class RuleMatchEntity {
  @Prop({ required: true })
  eventId!: string;

  @Prop({ required: true })
  agentId!: string;

  @Prop({ required: true, type: Types.ObjectId })
  ruleId!: Types.ObjectId;

  @Prop({ required: true })
  eventName!: string;

  @Prop({ required: true })
  eventValue!: number;

  @Prop({ required: true, type: Date })
  occurredAt!: Date;

  @Prop({ required: true, type: Date })
  matchedAt!: Date;

  @Prop({
    required: true,
    type: {
      eventName: { type: String, required: true },
      operator: { type: String, required: true },
      threshold: { type: Number, required: true },
    },
  })
  ruleSnapshot!: RuleSnapshot;
}

export const RuleMatchSchema = SchemaFactory.createForClass(RuleMatchEntity);
RuleMatchSchema.index({ eventId: 1, ruleId: 1 }, { unique: true });
RuleMatchSchema.index({ ruleId: 1, occurredAt: 1, agentId: 1 });
RuleMatchSchema.index({ ruleId: 1, agentId: 1 });
