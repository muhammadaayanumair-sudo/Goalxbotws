'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const Bet = require('../../models/Bet');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bethistory')
    .setDescription('View your complete betting history and statistics'),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      await interaction.deferReply({ ephemeral: true });

      const [bets, user] = await Promise.all([
        Bet.find({ userId: interaction.user.id }).sort({ createdAt: -1 }).limit(20).lean(),
        User.findOne({ userId: interaction.user.id }).lean(),
      ]);

      if (!bets.length) {
        return interaction.editReply({
          embeds: [EmbedFactory.warning('No History', 'You haven\'t placed any bets yet.\n\nUse `/bet` to place your first bet!')],
        });
      }

      const won = bets.filter((b) => b.status === 'won').length;
      const lost = bets.filter((b) => b.status === 'lost').length;
      const pending = bets.filter((b) => b.status === 'pending').length;
      const totalWon = bets.reduce((a, b) => a + (b.coinsAwarded || 0), 0);
      const totalStaked = bets.reduce((a, b) => a + b.amount, 0);
      const profit = totalWon - bets.filter((b) => b.status !== 'pending').reduce((a, b) => a + b.amount, 0);

      const statusEmoji = { won: '✅', lost: '❌', pending: '⏳', void: '🔵' };

      const recentLines = bets.slice(0, 8).map((b) => {
        const emoji = statusEmoji[b.status] || '❓';
        return `${emoji} **${b.homeTeam} vs ${b.awayTeam}** — ${b.betType} (${b.prediction}) — ${formatCoins(b.amount)}`;
      });

      const embed = EmbedFactory.bet('Betting History')
        .addFields(
          {
            name: '📊 Statistics',
            value: [
              `**Total Bets:** ${bets.length}`,
              `**Won:** ${won} | **Lost:** ${lost} | **Pending:** ${pending}`,
              `**Win Rate:** ${bets.length > 0 ? ((won / (won + lost || 1)) * 100).toFixed(1) : 0}%`,
              `**Total Staked:** ${formatCoins(totalStaked)}`,
              `**Total Won:** ${formatCoins(totalWon)}`,
              `**Net P/L:** ${profit >= 0 ? '📈' : '📉'} ${formatCoins(Math.abs(profit))} ${profit >= 0 ? 'profit' : 'loss'}`,
            ].join('\n'),
            inline: false,
          },
          {
            name: '📋 Recent Bets',
            value: recentLines.join('\n') || 'No bets',
            inline: false,
          }
        );

      await interaction.editReply({ embeds: [embed] });
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
