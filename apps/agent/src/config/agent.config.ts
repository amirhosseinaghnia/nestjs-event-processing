import * as Joi from 'joi';

export interface AgentConfig {
  agentId: string;
  rabbitmqUrl: string;
  eventRatePerSec: number;
  logLevel: string;
}

interface AgentEnv {
  AGENT_ID: string;
  RABBITMQ_URL: string;
  EVENT_RATE_PER_SEC: number;
  LOG_LEVEL: string;
}

export const agentConfigValidationSchema = Joi.object<AgentEnv>({
  AGENT_ID: Joi.string().min(1).required(),
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .required(),
  EVENT_RATE_PER_SEC: Joi.number().positive().default(5),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'log', 'debug', 'verbose')
    .default('log'),
});

export function loadAgentConfig(
  env: NodeJS.ProcessEnv = process.env,
): AgentConfig {
  const result = agentConfigValidationSchema.validate(env, {
    abortEarly: false,
    allowUnknown: true,
    convert: true,
  });

  if (result.error) {
    throw new Error(`Invalid Agent configuration: ${result.error.message}`);
  }

  const value = result.value;

  return {
    agentId: value.AGENT_ID,
    rabbitmqUrl: value.RABBITMQ_URL,
    eventRatePerSec: value.EVENT_RATE_PER_SEC,
    logLevel: value.LOG_LEVEL,
  };
}
