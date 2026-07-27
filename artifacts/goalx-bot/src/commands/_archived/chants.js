'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { AiService } = require('../../services/ai/AiService');
const { logger } = require('../../utils/logger');

/**
 * /chants - pure creative generation, no football-API call needed at all.
 * Results cached 24h in AiService so repeated requests for the same team
 * don't burn a fresh Groq generation every time.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('chants')
    .setDescription('AI writes fun fan chants for a team')
    .addStringOption((opt) => opt.setName('team').setDescription('Team name').setRequired(true)),

  cooldown: 15,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const ai = new AiService(client.cache);
      const teamName = interaction.options.getString('team');

      try {
        const chants = await ai.teamChants(teamName);
        const embed = EmbedFactory.ai(`Fan Chants: ${teamName}`, chants);
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Could not generate chants.')] });
      }
    } catch (error) {
    const isExpiredInteraction = error.code === 10062;
    if (!isExpiredInteraction) {
      logger.error(`[${interaction.commandName}] execute error:`, error);
    }
    try {
      const msg = {
        embeds: [EmbedFactory.error('Something went wrong', error.message || 'An unexpected error occurred.')],
        flags: 64,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else if (!isExpiredInteraction) {
        await interaction.reply(msg);
      }
    } catch (_) { /* interaction already expired */ }
  }
},
};
