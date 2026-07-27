'use strict';

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * Collects all command JSON definitions by walking the commands directory.
 */
function collectCommandData() {
  const commands = [];
  const commandsPath = path.join(__dirname, '..', 'commands');

  const categories = fs.readdirSync(commandsPath).filter((f) =>
    !f.startsWith('_') && fs.statSync(path.join(commandsPath, f)).isDirectory()
  );

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith('.js'));

    for (const file of files) {
      try {
        // Clear require cache so this works on hot reload too
        const fullPath = path.join(categoryPath, file);
        delete require.cache[require.resolve(fullPath)];
        const command = require(fullPath);
        if (command.data) commands.push(command.data.toJSON());
      } catch (err) {
        logger.error(`[DeployCommands] Failed to load ${file}:`, err.message);
      }
    }
  }

  return commands;
}

/**
 * Deploys all slash commands to Discord.
 * Called automatically on bot startup (see index.js) AND runnable manually via CLI.
 *
 * Guild deploy (instant, used if DISCORD_TEST_GUILD_ID is set) vs
 * Global deploy (takes up to 1h to propagate, used otherwise).
 */
async function deployCommands({ silent = false } = {}) {
  const commands = collectCommandData();
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  const log = (msg) => { if (!silent) logger.info(msg); };

  try {
    log(`[DeployCommands] Deploying ${commands.length} slash commands...`);

    let data;
    if (process.env.DISCORD_TEST_GUILD_ID) {
      data = await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_TEST_GUILD_ID),
        { body: commands }
      );
      log(`[DeployCommands] ✅ Deployed ${data.length} commands to test guild (instant).`);
    } else {
      data = await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: commands }
      );
      log(`[DeployCommands] ✅ Deployed ${data.length} commands globally (up to 1h to appear).`);
    }

    return { success: true, count: data.length };
  } catch (error) {
    logger.error('[DeployCommands] ❌ Failed to deploy commands:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { deployCommands, collectCommandData };

// Allow running directly: node src/handlers/deployCommands.js [--guild]
if (require.main === module) {
  deployCommands().then(() => process.exit(0));
}
