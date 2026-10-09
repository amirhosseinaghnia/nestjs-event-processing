import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EventDocument = HydratedDocument<EventEntity>;

@Schema({
  collection: 'events',
  timestamps: { createdAt: true, updatedAt: false },
})
export class EventEntity {
  @Prop({ required: true })
  eventId!: string;

  @Prop({ required: true })
  agentId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  value!: number;

  @Prop({ required: true, type: Date })
  occurredAt!: Date;

  @Prop({ required: true, type: Date })
  receivedAt!: Date;

  /**
   * Marks whether matching has finished for this event.
   * Supports at-least-once delivery: duplicates of completed events short-circuit;
   * incomplete events resume matching without re-inserting the event.
   */
  @Prop({ required: true, default: false })
  processingCompleted!: boolean;
}

export const EventSchema = SchemaFactory.createForClass(EventEntity);
EventSchema.index({ eventId: 1 }, { unique: true });
