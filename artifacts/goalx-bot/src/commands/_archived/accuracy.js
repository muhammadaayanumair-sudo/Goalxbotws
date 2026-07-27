'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const Bet = require('../../models/Bet');
const { logger } = require('../../utils/logger');

const BET_TYPE_LABELS = {
  winner: '🏆 Match Winner',
  correct_score: '🎯 Correct Score',
  btts: '⚽ Both Teams to Score',
  over_under: '📊 Over/Under',
  both_to_score: '⚽ Both Teams to Score',
};

/**
 * /accuracy - shows prediction accuracy broken down by bet type, across
 * ALL resolved bets (not capped at 20 like /bethistory's recent list).
 * Pure MongoDB aggregation, zero new API cost.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('accuracy')
    .setDescription('View your prediction accuracy broken down by bet type')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Check another user\'s accuracy').setRequired(false)
    ),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const target = interaction.options.getUser('user') || interaction.user;

      const results = await Bet.aggregate([
        { $match: { userId: target.id, status: { $in: ['won', 'lost'] } } },
        {
          $group: {
            _id: '$betType',
            won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
            total: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]);

      if (!results.length) {
        return interaction.editReply({
          embeds: [EmbedFactory.warning('No Resolved Bets', `${target.id === interaction.user.id ? 'You haven\'t' : `${target.username} hasn't`} had any bets resolved yet.`)],
        });
      }

      const totalWon = results.reduce((a, r) => a + r.won, 0);
      const totalPlaced = results.reduce((a, r) => a + r.total, 0);
      const overallAccuracy = ((totalWon / totalPlaced) * 100).toFixed(1);

      const lines = results.map((r) => {
        const label = BET_TYPE_LABELS[r._id] || r._id;
        const accuracy = ((r.won / r.total) * 100).toFixed(1);
        const bar = EmbedFactory.clamp('█'.repeat(Math.round(accuracy / 10)) + '░'.repeat(10 - Math.round(accuracy / 10)), 10);
        return `${label}\n\`${bar}\` **${accuracy}%** (${r.won}/${r.total})`;
      });

      const embed = EmbedFactory.bet(
        `${target.id === interaction.user.id ? 'Your' : `${target.username}'s`} Prediction Accuracy`,
        `**Overall: ${overallAccuracy}%** (${totalWon}/${totalPlaced} correct)\n`
      );

      EmbedFactory.addFields(embed, [
        { name: '📈 By Bet Type', value: lines.join('\n\n') },
      ]);

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
