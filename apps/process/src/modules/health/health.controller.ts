import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    private readonly redis: RedisService,
    private readonly rabbitMq: RabbitMqService,
  ) {}

  @Get()
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  async readiness() {
    const mongoOk = Number(this.mongo.readyState) === 1;
    const redisOk = await this.redis.ping();
    const rabbitOk = await this.rabbitMq.ping();
    const ready = mongoOk && redisOk && rabbitOk;

    return {
      status: ready ? 'ok' : 'degraded',
      checks: {
        mongodb: mongoOk ? 'up' : 'down',
        redis: redisOk ? 'up' : 'down',
        rabbitmq: rabbitOk ? 'up' : 'down',
      },
    };
  }
}
