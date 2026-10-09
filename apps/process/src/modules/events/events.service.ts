import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventMessageV1 } from '@app/shared';
import { EventEntity, EventDocument } from './event.schema';

export interface UpsertEventResult {
  event: EventDocument;
  isNew: boolean;
  alreadyCompleted: boolean;
}

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(EventEntity.name)
    private readonly eventModel: Model<EventDocument>,
  ) {}

  async upsertFromMessage(message: EventMessageV1): Promise<UpsertEventResult> {
    try {
      const created = await this.eventModel.create({
        eventId: message.eventId,
        agentId: message.agentId,
        name: message.name,
        value: message.value,
        occurredAt: new Date(message.occurredAt),
        receivedAt: new Date(),
        processingCompleted: false,
      });
      return { event: created, isNew: true, alreadyCompleted: false };
    } catch (error) {
      const err = error as { code?: number };
      if (err.code !== 11000) {
        throw error;
      }

      const existing = await this.eventModel.findOne({
        eventId: message.eventId,
      });
      if (!existing) {
        throw error;
      }

      return {
        event: existing,
        isNew: false,
        alreadyCompleted: existing.processingCompleted,
      };
    }
  }

  async markCompleted(eventId: string): Promise<void> {
    await this.eventModel.updateOne(
      { eventId },
      { $set: { processingCompleted: true } },
    );
  }
}
