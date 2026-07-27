'use strict';

const { logger } = require('../utils/logger');

module.exports = {
  name: 'guildDelete',
  once: false,
  async execute(guild, client) {
    logger.info(`[Bot] Left guild: ${guild.name} (${guild.id})`);
  },
};
