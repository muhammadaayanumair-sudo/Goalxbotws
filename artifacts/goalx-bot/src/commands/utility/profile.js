'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins, formatNumber, progressBar } = require('../../utils/formatters');
const User = require('../../models/User');
const Card = require('../../models/Card');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('🆔 View your GoalX profile')
    .addUserOption((opt) =>
      opt.setName('user')
        .setDescription('View another user\'s profile')
        .setRequired(false)
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const target = interaction.options.getUser('user') || interaction.user;
      let user = await User.findOne({ userId: target.id }).lean();

      if (!user) {
        return interaction.reply({
          embeds: [EmbedFactory.warning('Profile Not Found', `${target.username} hasn't used GoalX yet.`)],
          ephemeral: true,
        });
      }

      const xpNeeded = Math.floor(100 * Math.pow(1.5, user.level - 1));
      const bar = progressBar(user.xp, xpNeeded, 14);

      const cardCounts = await Card.aggregate([
        { $match: { ownerId: target.id } },
        { $group: { _id: '$rarity', count: { $sum: 1 } } },
      ]);
      const byRarity = Object.fromEntries(cardCounts.map((c) => [c._id, c.count]));

      const rarityStr = ['legendary', 'epic', 'rare', 'common']
        .map((r) => byRarity[r] ? `${r === 'legendary' ? '🟡' : r === 'epic' ? '🟣' : r === 'rare' ? '🔵' : '⚪'} ${byRarity[r]}` : null)
        .filter(Boolean)
        .join(' · ') || 'No cards';

      // Build badges string
      const badges = [];
      if (user.isPartner) badges.push('🤝 Partner');
      if (user.premium) badges.push('👑 Premium');
      const badgeStr = badges.length ? badges.join(' · ') : '';

      const levelLine = [
        `**Level ${user.level}**`,
        badgeStr,
      ].filter(Boolean).join(' · ');

      const embed = EmbedFactory.base(`⚽ **${target.username}'s GoalX Profile**`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .addFields(
          {
            name: '⭐ Level & Progress',
            value: [
              levelLine,
              `XP: ${formatNumber(user.xp)} / ${formatNumber(xpNeeded)}`,
              `\`${bar}\``,
            ].join('\n'),
            inline: false,
          },
          {
            name: '💰 Economy',
            value: [
              `Wallet: ${formatCoins(user.coins)}`,
              `Bank: ${formatCoins(user.bank)}`,
              `Total Earned: ${formatCoins(user.totalEarned)}`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🎰 Betting',
            value: [
              `Bets: ${user.betsWon}/${user.betsPlaced} won`,
              `Win Rate: ${user.betsPlaced > 0 ? ((user.betsWon / user.betsPlaced) * 100).toFixed(1) : 0}%`,
              `Coins Won: ${formatCoins(user.betCoinsWon)}`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🃏 Cards',
            value: [
              `Collection: **${user.cardsOwned}** cards`,
              `Packs Opened: ${user.packsOpened}`,
              rarityStr,
            ].join('\n'),
            inline: false,
          }
        )
        .setFooter({ text: `⚽ Powered by GoalX · Member since ${new Date(user.createdAt).toLocaleDateString()}` });

      if (user.isPartner) {
        const since = user.partnerSince
          ? new Date(user.partnerSince).toLocaleDateString()
          : 'Unknown';
        embed.addFields({
          name: '🤝 Partner Status',
          value: `Active · Partner since ${since}\n+75% daily · +50% work · Exclusive commands & VIP packs`,
          inline: false,
        });
      }

      if (user.favoriteTeams?.length > 0) {
        embed.addFields({
          name: '❤️ Favorite Teams',
          value: user.favoriteTeams.slice(0, 5).join(', '),
          inline: false,
        });
      }

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:profile')
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
