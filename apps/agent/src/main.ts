import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AgentModule } from './agent.module';
import { loadAgentConfig } from './config/agent.config';

async function bootstrap(): Promise<void> {
  const config = loadAgentConfig();
  const app = await NestFactory.createApplicationContext(AgentModule, {
    logger:
      config.logLevel === 'debug'
        ? ['error', 'warn', 'log', 'debug']
        : ['error', 'warn', 'log'],
  });

  app.enableShutdownHooks();

  const logger = new Logger('AgentBootstrap');
  logger.log(`Agent started agentId=${config.agentId}`);
}

void bootstrap();
