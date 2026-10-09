import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { loadProcessConfig } from './common/config/process.config';
import { ProcessModule } from './process.module';

async function bootstrap(): Promise<void> {
  const config = loadProcessConfig();
  const app = await NestFactory.create(ProcessModule, {
    logger:
      config.logLevel === 'debug'
        ? ['error', 'warn', 'log', 'debug']
        : ['error', 'warn', 'log'],
  });

  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Process Service API')
    .setDescription(
      'Rules CRUD and reporting APIs for agent event rule matching',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(config.port);
  const logger = new Logger('ProcessBootstrap');
  logger.log(`Process service listening on port ${config.port}`);
  logger.log(`Swagger docs available at /docs`);
}

void bootstrap();
