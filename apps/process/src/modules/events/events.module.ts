import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEntity, EventSchema } from './event.schema';
import { EventsService } from './events.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EventEntity.name, schema: EventSchema },
    ]),
  ],
  providers: [EventsService],
  exports: [EventsService, MongooseModule],
})
export class EventsModule {}
