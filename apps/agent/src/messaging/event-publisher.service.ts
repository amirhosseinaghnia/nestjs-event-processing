import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import amqp, {
  AmqpConnectionManager,
  ChannelWrapper,
} from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';
import { EventMessageV1, MESSAGING } from '@app/shared';
import { loadAgentConfig } from '../config/agent.config';

@Injectable()
export class EventPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPublisherService.name);
  private connection!: AmqpConnectionManager;
  private channel!: ChannelWrapper;
  private ready = false;

  async onModuleInit(): Promise<void> {
    const config = loadAgentConfig();
    this.connection = amqp.connect([config.rabbitmqUrl]);

    this.connection.on('connect', () => {
      this.logger.log('Connected to RabbitMQ');
    });
    this.connection.on('disconnect', (err) => {
      this.logger.warn(
        `Disconnected from RabbitMQ: ${err?.err?.message ?? 'unknown'}`,
      );
      this.ready = false;
    });

    this.channel = this.connection.createChannel({
      json: true,
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(MESSAGING.EXCHANGE, 'direct', {
          durable: true,
        });
        this.ready = true;
      },
    });

    await this.channel.waitForConnect();
  }

  async publish(message: EventMessageV1): Promise<void> {
    if (!this.ready) {
      throw new Error('RabbitMQ publisher is not ready');
    }

    await this.channel.publish(
      MESSAGING.EXCHANGE,
      MESSAGING.ROUTING_KEY,
      message,
      {
        persistent: true,
        contentType: 'application/json',
        messageId: message.eventId,
        timestamp: Date.now(),
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing RabbitMQ publisher');
    try {
      await this.channel?.close();
    } catch {
      // ignore
    }
    try {
      await this.connection?.close();
    } catch {
      // ignore
    }
  }
}
