'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatCoins, formatNumber, progressBar } = require('../../utils/formatters');
const { EmbedFactory } = require('../../utils/embed');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('💰 Check your GoalCoins balance and stats')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Check another user\'s balance').setRequired(false)
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const target = interaction.options.getUser('user') || interaction.user;
      const isSelf = target.id === interaction.user.id;

      let user = await User.findOne({ userId: target.id });
      if (!user) {
        if (isSelf) {
          user = await User.create({ userId: target.id, username: target.username });
        } else {
          return interaction.reply({
            embeds: [EmbedFactory.warning('User Not Found', 'That user has not used GoalX yet.')],
            ephemeral: true,
          });
        }
      }

      const xpNeeded = Math.floor(100 * Math.pow(1.5, user.level - 1));
      const xpBar    = progressBar(user.xp, xpNeeded, 12);
      const winRate  = user.betsPlaced > 0 ? `${((user.betsWon / user.betsPlaced) * 100).toFixed(1)}%` : 'N/A';

      const embed = EmbedFactory.economy(
        isSelf ? 'Your Wallet' : `${target.username}'s Wallet`,
        `Level **${user.level}** · \`${xpBar}\` **${formatNumber(user.xp)}**/${formatNumber(xpNeeded)} XP\n`
      ).setThumbnail(target.displayAvatarURL());

      EmbedFactory.addFields(embed, [
        {
          name: '💳 Balance',
          value: EmbedFactory.statBlock([
            ['Wallet', formatCoins(user.coins)],
            ['Bank', formatCoins(user.bank)],
            ['Total', formatCoins(user.coins + user.bank)],
          ]),
          inline: true,
        },
        {
          name: '📊 Lifetime',
          value: EmbedFactory.statBlock([
            ['Earned', formatCoins(user.totalEarned)],
            ['Spent', formatCoins(user.totalSpent)],
          ]),
          inline: true,
        },
        {
          name: '🎯 Activity',
          value: EmbedFactory.statBlock([
            ['Bets', `${user.betsWon}/${user.betsPlaced} (${winRate})`],
            ['Cards', `${user.cardsOwned} · Packs: ${user.packsOpened}`],
          ]),
          inline: true,
        },
      ]);

      if (isSelf) embed.setFooter({ text: '⚽ Powered by GoalX Economy · Use /daily to claim rewards' });

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:balance')
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
