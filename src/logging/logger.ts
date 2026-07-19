import pino, { type LoggerOptions } from 'pino';
import { env } from '../config/env.js';

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: ['*.token', '*.apiKey', 'SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'ANTHROPIC_API_KEY'],
};

if (process.env.NODE_ENV !== 'production') {
  options.transport = { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } };
}

export const logger = pino(options);
