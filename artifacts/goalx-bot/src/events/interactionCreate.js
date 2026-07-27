'use strict';

const { InteractionHandler } = require('../handlers/InteractionHandler');

const handler = { instance: null };

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    if (!handler.instance) {
      handler.instance = new InteractionHandler(client);
    }
    await handler.instance.handle(interaction).catch((err) => {
      if (err.code === 10062) return; // interaction expired — nothing to do
      const { logger } = require('../utils/logger');
      logger.error('[interactionCreate] Unhandled error:', err);
    });
  },
};
