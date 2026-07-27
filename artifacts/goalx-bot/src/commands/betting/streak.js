'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const Bet = require('../../models/Bet');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

/**
 * /streak - computes the user's current and best-ever winning/losing streaks
 * purely from existing Bet records, ordered by resolvedAt. No new API calls.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('🔮 View your current prediction win/loss streak')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('👤 Check another user\'s streak').setRequired(false)
    ),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      const target = interaction.options.getUser('user') || interaction.user;

      const bets = await Bet.find({
        userId: target.id,
        status: { $in: ['won', 'lost'] },
      }).sort({ resolvedAt: 1 }).lean();

      if (!bets.length) {
        return interaction.reply({
          embeds: [EmbedFactory.warning('No Resolved Bets', `${target.id === interaction.user.id ? 'You haven\'t' : `${target.username} hasn't`} had any bets resolved yet.\n\nUse \`/bet\` to place your first prediction.`)],
          ephemeral: target.id === interaction.user.id,
        });
      }

      // Walk through chronologically to find current streak (from the end)
      // and best-ever streak (anywhere in history).
      let currentStreak = 0;
      let currentType = null; // 'won' | 'lost'
      let bestWinStreak = 0;
      let bestLossStreak = 0;
      let runningWin = 0;
      let runningLoss = 0;

      for (const bet of bets) {
        if (bet.status === 'won') {
          runningWin += 1;
          runningLoss = 0;
          bestWinStreak = Math.max(bestWinStreak, runningWin);
        } else {
          runningLoss += 1;
          runningWin = 0;
          bestLossStreak = Math.max(bestLossStreak, runningLoss);
        }
      }

      // Current streak = look at the tail of the chronological list
      for (let i = bets.length - 1; i >= 0; i--) {
        const status = bets[i].status;
        if (currentType === null) {
          currentType = status;
          currentStreak = 1;
        } else if (status === currentType) {
          currentStreak += 1;
        } else {
          break;
        }
      }

      const streakEmoji = currentType === 'won' ? '🔥' : '❄️';
      const streakLabel = currentType === 'won' ? 'Winning' : 'Losing';

      const embed = EmbedFactory.bet(
        `${target.id === interaction.user.id ? 'Your' : `${target.username}'s`} Prediction Streak`,
        `${streakEmoji} **Current ${streakLabel} Streak: ${currentStreak}**\n`
      );

      EmbedFactory.addFields(embed, [
        {
          name: '📊 Best Ever',
          value: `🔥 Longest win streak: **${bestWinStreak}**\n❄️ Longest loss streak: **${bestLossStreak}**`,
        },
        {
          name: '🎯 Total Record',
          value: `${bets.filter((b) => b.status === 'won').length}W - ${bets.filter((b) => b.status === 'lost').length}L (${bets.length} resolved)`,
        },
      ]);

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:streak')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.reply({ embeds: [embed] ,
        components: [refreshRow]});
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
