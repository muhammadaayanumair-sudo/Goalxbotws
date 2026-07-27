'use strict';

const { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

/**
 * /tactics — Partner-exclusive full AI tactical breakdown of a team.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('tactics')
    .setDescription('📋 [Partner] AI full tactical breakdown of a team')
    .addStringOption((opt) =>
      opt.setName('team')
        .setDescription('📋 Team name, e.g. Arsenal')
        .setRequired(true)
    ),

  cooldown: 25,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      await interaction.deferReply();

      const teamName = interaction.options.getString('team');
      const ai = client.aiRouter;

      try {
        const breakdown = await ai.tacticalBreakdown(teamName);

        const embed = EmbedFactory.ai(`📋 Tactical Breakdown: ${teamName}`, breakdown)
          .setFooter({ text: '⚽ Powered by GoalX · Partner Feature · AI Tactics Analyst' });

                const helpRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('help:tactics')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed] ,
          components: [helpRow]});
      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Tactics Failed', err.message || 'Could not generate tactical breakdown.')],
        });
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
