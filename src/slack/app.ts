import { App, LogLevel } from '@slack/bolt';
import { env } from '../config/env.js';
import { registerAppMentionHandler } from './handlers/appMention.js';
import { registerDirectMessageHandler } from './handlers/directMessage.js';

export const app = new App({
  token: env.SLACK_BOT_TOKEN,
  appToken: env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace' ? LogLevel.DEBUG : LogLevel.INFO,
});

registerAppMentionHandler(app);
registerDirectMessageHandler(app);
