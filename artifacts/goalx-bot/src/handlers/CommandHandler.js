'use strict';

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * CommandHandler - Recursively loads all command files from the commands directory.
 * Each command file must export a { data, execute } object.
 */
class CommandHandler {
  constructor(client) {
    this.client = client;
    this.commandsPath = path.join(__dirname, '..', 'commands');
  }

  /**
   * Walks all subdirectories in the commands folder and loads every .js file.
   */
  async loadCommands() {
    const categories = fs.readdirSync(this.commandsPath).filter((f) =>
      !f.startsWith('_') && fs.statSync(path.join(this.commandsPath, f)).isDirectory()
    );

    for (const category of categories) {
      const categoryPath = path.join(this.commandsPath, category);
      const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith('.js'));

      for (const file of files) {
        const filePath = path.join(categoryPath, file);
        try {
          const command = require(filePath);

          if (!command.data || !command.execute) {
            logger.warn(`[CommandHandler] Skipped ${file}: missing data or execute`);
            continue;
          }

          this.client.commands.set(command.data.name, command);
          logger.debug(`[CommandHandler] Loaded command: ${command.data.name}`);
        } catch (err) {
          logger.error(`[CommandHandler] Failed to load ${file}:`, err.message);
        }
      }
    }
  }
}

module.exports = { CommandHandler };
