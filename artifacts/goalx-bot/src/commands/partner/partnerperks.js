'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

const PERKS = [
  '🧠 AI Commands — `/analyze` `/recap` `/impact`',
  '🔍 Exclusive AI — `/scout` `/tactics` `/deepdive` `/protip`',
  '🎲 Betting — `/duel` `/challenge` `/streak`',
  '🃏 Cards — `/openpack` `/vippack` `/trade` `/auction`',
  '💰 Economy — `/payday` `/weekly` · +75% daily · +50% work',
  '🏟️ Fantasy — `/myteam` `/challenges`',
  '🏅 Partner badge shown on your `/profileplus`',
  '🌍 Partner-only commands — `/serverplus` `/lastfive` `/advancedstats` `/proleagues`',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('partnerperks')
    .setDescription('🤝 Partner-only: list all GoalX partner perks'),

  cooldown: 10,

  async execute(interaction, client) {
    try {
      if (!await requirePartner(interaction)) return;

      const embed = EmbedFactory.base('🤝 **GoalX Partner Perks**')
        .setDescription('Thank you for supporting GoalX! Here is everything unlocked by your partner status:\n\n' + PERKS.map((p) => `• ${p}`).join('\n'))
        .setFooter({ text: '⚽ GoalX Partner · Use /profileplus to see your badge' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('refresh:partnerperks').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error(`[${interaction.commandName}] execute error:`, error);
      const msg = { embeds: [EmbedFactory.error('Error', error.message || 'Something went wrong.')], flags: 64 };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
