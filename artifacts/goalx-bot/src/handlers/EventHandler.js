'use strict';

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * EventHandler - Loads and registers all Discord event listeners.
 * Each event file must export { name, once, execute }.
 */
class EventHandler {
  constructor(client) {
    this.client = client;
    this.eventsPath = path.join(__dirname, '..', 'events');
  }

  async loadEvents() {
    const files = fs.readdirSync(this.eventsPath).filter((f) => f.endsWith('.js'));

    for (const file of files) {
      const filePath = path.join(this.eventsPath, file);
      try {
        const event = require(filePath);

        if (!event.name || !event.execute) {
          logger.warn(`[EventHandler] Skipped ${file}: missing name or execute`);
          continue;
        }

        if (event.once) {
          this.client.once(event.name, (...args) => event.execute(...args, this.client));
        } else {
          this.client.on(event.name, (...args) => event.execute(...args, this.client));
        }

        logger.debug(`[EventHandler] Registered event: ${event.name}`);
      } catch (err) {
        logger.error(`[EventHandler] Failed to load event ${file}:`, err.message);
      }
    }
  }
}

module.exports = { EventHandler };
