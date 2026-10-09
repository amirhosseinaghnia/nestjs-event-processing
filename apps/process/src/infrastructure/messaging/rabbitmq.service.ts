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
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { MESSAGING } from '@app/shared';
import { loadProcessConfig } from '../../common/config/process.config';

export type MessageHandler = (msg: ConsumeMessage) => Promise<void>;

@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection!: AmqpConnectionManager;
  private channel!: ChannelWrapper;
  private consumerTag: string | null = null;
  private handler: MessageHandler | null = null;
  private shuttingDown = false;

  async onModuleInit(): Promise<void> {
    const config = loadProcessConfig();
    this.connection = amqp.connect([config.rabbitmqUrl]);

    this.connection.on('connect', () =>
      this.logger.log('Connected to RabbitMQ'),
    );
    this.connection.on('disconnect', (err) =>
      this.logger.warn(
        `Disconnected from RabbitMQ: ${err?.err?.message ?? 'unknown'}`,
      ),
    );

    this.channel = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.prefetch(config.rabbitmqPrefetch);

        await channel.assertExchange(MESSAGING.DLX, 'direct', {
          durable: true,
        });
        await channel.assertQueue(MESSAGING.DLQ, { durable: true });
        await channel.bindQueue(
          MESSAGING.DLQ,
          MESSAGING.DLX,
          MESSAGING.ROUTING_KEY,
        );

        await channel.assertExchange(MESSAGING.EXCHANGE, 'direct', {
          durable: true,
        });
        await channel.assertQueue(MESSAGING.QUEUE, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': MESSAGING.DLX,
            'x-dead-letter-routing-key': MESSAGING.ROUTING_KEY,
          },
        });
        await channel.bindQueue(
          MESSAGING.QUEUE,
          MESSAGING.EXCHANGE,
          MESSAGING.ROUTING_KEY,
        );

        if (this.handler && !this.shuttingDown) {
          await this.startConsumer(channel);
        }
      },
    });

    await this.channel.waitForConnect();
  }

  async consume(handler: MessageHandler): Promise<void> {
    this.handler = handler;
    await this.channel.addSetup(async (channel: ConfirmChannel) => {
      await this.startConsumer(channel);
    });
  }

  private async startConsumer(channel: ConfirmChannel): Promise<void> {
    if (!this.handler || this.shuttingDown) {
      return;
    }

    const { consumerTag } = await channel.consume(
      MESSAGING.QUEUE,
      (msg) => {
        if (!msg) {
          return;
        }
        void this.handleMessage(channel, msg);
      },
      { noAck: false },
    );
    this.consumerTag = consumerTag;
    this.logger.log(`Consuming queue=${MESSAGING.QUEUE} tag=${consumerTag}`);
  }

  private async handleMessage(
    channel: ConfirmChannel,
    msg: ConsumeMessage,
  ): Promise<void> {
    if (!this.handler) {
      channel.nack(msg, false, true);
      return;
    }

    try {
      await this.handler(msg);
      channel.ack(msg);
    } catch (error) {
      const err = error as Error;
      const deaths =
        (
          msg.properties.headers?.['x-death'] as
            Array<{ count: number }> | undefined
        )?.[0]?.count ?? 0;

      this.logger.error(
        `Message processing failed (deathCount=${deaths}): ${err.message}`,
        err.stack,
      );

      // After several redeliveries RabbitMQ DLX will eventually receive poison messages
      // when we nack without requeue for permanent validation errors.
      const permanent =
        err.name === 'ValidationError' ||
        err.message.startsWith('Invalid event');

      channel.nack(msg, false, !permanent);
    }
  }

  ping(): Promise<boolean> {
    try {
      return Promise.resolve(this.connection.isConnected());
    } catch {
      return Promise.resolve(false);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    this.logger.log('Stopping RabbitMQ consumer');
    try {
      if (this.consumerTag) {
        await this.channel.cancel(this.consumerTag);
      }
    } catch {
      // ignore
    }
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
