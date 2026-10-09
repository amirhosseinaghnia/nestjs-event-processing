import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { COMPARISON_OPERATORS, ComparisonOperator } from '@app/shared';

export type RuleDocument = HydratedDocument<RuleEntity>;

@Schema({
  collection: 'rules',
  timestamps: true,
})
export class RuleEntity {
  @Prop({ required: true })
  eventName!: string;

  @Prop({ required: true, type: String, enum: COMPARISON_OPERATORS })
  operator!: ComparisonOperator;

  @Prop({ required: true })
  threshold!: number;
}

export const RuleSchema = SchemaFactory.createForClass(RuleEntity);
RuleSchema.index({ eventName: 1 });
