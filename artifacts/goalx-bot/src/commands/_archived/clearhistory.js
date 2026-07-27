'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { AiService } = require('../../services/ai/AiService');
const { logger } = require('../../utils/logger');

// Singleton AI service per process
let aiServiceInstance = null;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearhistory')
    .setDescription('Clear your AI conversation history to start fresh'),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      if (!aiServiceInstance) {
        aiServiceInstance = new AiService(client.cache);
      }
      aiServiceInstance.clearHistory(interaction.user.id);

      await interaction.reply({
        embeds: [EmbedFactory.success('History Cleared', 'Your AI conversation history has been reset. The next `/ask` will start a fresh conversation.')],
        ephemeral: true,
      });
    } catch (error) {
    logger.error(`[${interaction.commandName}] execute error:`, error);
    const msg = {
      embeds: [EmbedFactory.error('Something went wrong', error.message || 'An unexpected error occurred. Please try again.')],
      ephemeral: true,
    };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch (_) { /* interaction already timed out */ }
  }
},
};
