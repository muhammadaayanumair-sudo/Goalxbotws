'use strict';

const { logger } = require('../utils/logger');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    logger.info(`[Bot] Logged in as ${client.user.tag}`);
    logger.info(`[Bot] Serving ${client.guilds.cache.size} guild(s)`);

    client.user.setPresence({
      activities: [{ name: '⚽ /help | GoalX' }],
      status: 'online',
    });

    // Start schedulers after bot is ready
    if (client.schedulerManager) {
      await client.schedulerManager.startAll();
    }
  },
};
