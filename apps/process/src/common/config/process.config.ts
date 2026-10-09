import * as Joi from 'joi';

export interface ProcessConfig {
  port: number;
  mongodbUri: string;
  redisUrl: string;
  rabbitmqUrl: string;
  rabbitmqPrefetch: number;
  logLevel: string;
}

interface ProcessEnv {
  PORT: number;
  MONGODB_URI: string;
  REDIS_URL: string;
  RABBITMQ_URL: string;
  RABBITMQ_PREFETCH: number;
  LOG_LEVEL: string;
}

export const processConfigValidationSchema = Joi.object<ProcessEnv>({
  PORT: Joi.number().port().default(3000),
  MONGODB_URI: Joi.string()
    .uri({ scheme: [/mongodb(\+srv)?/] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .required(),
  RABBITMQ_PREFETCH: Joi.number().integer().positive().default(10),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'log', 'debug', 'verbose')
    .default('log'),
});

export function loadProcessConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProcessConfig {
  const result = processConfigValidationSchema.validate(env, {
    abortEarly: false,
    allowUnknown: true,
    convert: true,
  });

  if (result.error) {
    throw new Error(`Invalid Process configuration: ${result.error.message}`);
  }

  const value = result.value;

  return {
    port: value.PORT,
    mongodbUri: value.MONGODB_URI,
    redisUrl: value.REDIS_URL,
    rabbitmqUrl: value.RABBITMQ_URL,
    rabbitmqPrefetch: value.RABBITMQ_PREFETCH,
    logLevel: value.LOG_LEVEL,
  };
}
