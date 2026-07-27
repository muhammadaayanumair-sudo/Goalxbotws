'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { validateEnvironment } = require('./config/validateEnv');

for (const envPath of [
  path.resolve(__dirname, '..', '.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'artifacts/goalx-bot/.env'),
]) {
  dotenv.config({ path: envPath });
}
const { connectDatabase } = require('./database/connection');
const { CommandHandler } = require('./handlers/CommandHandler');
const { EventHandler } = require('./handlers/EventHandler');
const { SchedulerManager } = require('./scheduler/SchedulerManager');
const { CacheService } = require('./services/cache/CacheService');
const { logger } = require('./utils/logger');
const { errorCollector } = require('./services/selfhealing/ErrorCollector');

// Validate env before anything else
validateEnvironment();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
});

// Attach shared services and state to client
client.commands = new Collection();
client.cache = new CacheService();
client.activeMatches = new Collection(); // Live match state tracking for LiveScoreScheduler
client.aiRouter = null; // Populated after AiService is ready (see events/ready.js or below)

/** Human-readable bot uptime (e.g. "2d 4h 12m") */
client.getUptime = () => {
  const ms = process.uptime() * 1000;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.length ? parts.join(' ') : '<1m';
};

async function main() {
  try {
    // Connect to database
    await connectDatabase();

    // Load commands
    const commandHandler = new CommandHandler(client);
    await commandHandler.loadCommands();
    logger.info(`[Bot] Loaded ${client.commands.size} commands`);

    // Load events
    const eventHandler = new EventHandler(client);
    await eventHandler.loadEvents();

    // Boot AI provider router (Cerebras + SambaNova + GLM + GitHub Models + Ollama + Groq + OpenRouter)
    try {
      const { AiService }        = require('./services/ai/AiService');
      const { AiProviderRouter } = require('./services/ai/AiProviderRouter');
      const aiService  = new AiService(client.cache);
      const aiRouter   = new AiProviderRouter(aiService);
      client.aiService = aiService;
      client.aiRouter  = aiRouter;
      logger.info('[Bot] AiProviderRouter initialised with 7-provider stack');
    } catch (aiErr) {
      logger.warn(`[Bot] AiProviderRouter failed to init (non-fatal): ${aiErr.message}`);
    }

    // Login to Discord
    await client.login(process.env.DISCORD_TOKEN);

    // Schedulers start after ready event (see events/ready.js)
    client.schedulerManager = new SchedulerManager(client);

  } catch (err) {
    logger.error('[Bot] Fatal startup error:', err.message);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal) {
  logger.info(`[Bot] Received ${signal}. Shutting down gracefully...`);
  if (client.schedulerManager) client.schedulerManager.stopAll();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  // Ignore expired/unknown interaction errors — these are expected in high-traffic bots
  if (reason?.code === 10062) return;
  logger.error('[Bot] Unhandled rejection:', reason);
  if (reason instanceof Error) {
    errorCollector.capture(reason, { type: 'unhandledRejection' });
  }
});
process.on('uncaughtException', (err) => {
  // Ignore Discord interaction expiry errors — never crash the process for these
  if (err.code === 10062 || err.message === 'Unknown interaction') return;
  logger.error('[Bot] Uncaught exception:', err.message);
  errorCollector.capture(err, { type: 'uncaughtException' });
  process.exit(1);
});

main();