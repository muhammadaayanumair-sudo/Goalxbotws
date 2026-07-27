'use strict';

const { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

/**
 * /scout — Partner-exclusive deep AI scouting report on any player.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('scout')
    .setDescription('🔍 [Partner] AI deep scouting report on any player')
    .addStringOption((opt) =>
      opt.setName('player')
        .setDescription('🔍 Player name, e.g. Jude Bellingham')
        .setRequired(true)
    ),

  cooldown: 25,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      await interaction.deferReply();

      const playerName = interaction.options.getString('player');
      const ai = client.aiRouter;

      try {
        const report = await ai.scoutPlayer(playerName);

        const embed = EmbedFactory.ai(`🔍 Scout Report: ${playerName}`, report)
          .setFooter({ text: '⚽ Powered by GoalX · Partner Feature · AI-powered scouting' });

                const helpRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('help:scout')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed] ,
          components: [helpRow]});
      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Scout Report Failed', err.message || 'Could not generate report.')],
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
