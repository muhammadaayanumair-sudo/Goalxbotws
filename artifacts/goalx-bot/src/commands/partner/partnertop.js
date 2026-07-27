'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { requirePartner } = require('../../utils/partnerGuard');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('partnertop')
    .setDescription('🤝 Partner-only: leaderboard of top GoalX partners'),

  cooldown: 10,

  async execute(interaction, client) {
    try {
      if (!await requirePartner(interaction)) return;

      const topPartners = await User.find({ isPartner: true })
        .select('userId username level xp coins totalEarned partnerSince')
        .sort({ level: -1, xp: -1, coins: -1 })
        .limit(10)
        .lean();

      if (!topPartners.length) {
        return interaction.reply({
          embeds: [EmbedFactory.warning('No Partners', 'No GoalX partners have been registered yet.')],
          flags: 64,
        });
      }

      const medals = ['🥇', '🥈', '🥉'];
      const lines = topPartners.map((u, i) => {
        const medal = medals[i] || `**${i + 1}.**`;
        const since = u.partnerSince ? `<t:${Math.floor(new Date(u.partnerSince).getTime() / 1000)}:D>` : '—';
        return `${medal} **${u.username || 'Unknown'}** · Lvl ${u.level || 1} · 🪙 ${(u.coins || 0).toLocaleString()} · Partner since ${since}`;
      });

      const embed = EmbedFactory.base('🏆 **Top GoalX Partners**')
        .setDescription(lines.join('\n'))
        .setFooter({ text: '⚽ GoalX Partner · Partner Leaderboard' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('refresh:partnertop').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
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
