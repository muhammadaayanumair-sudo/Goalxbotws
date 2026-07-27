'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { progressBar, formatNumber, ordinal } = require('../../utils/formatters');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('🏆 View your level and XP rank')
    .addUserOption((opt) => opt.setName('user').setDescription('Check another user\'s rank').setRequired(false)),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const target = interaction.options.getUser('user') || interaction.user;
      const user = await User.findOne({ userId: target.id }).lean();

      if (!user) {
        return interaction.reply({
          embeds: [EmbedFactory.warning('Not Found', `**${target.username}** has not used GoalX yet.`)],
          ephemeral: true,
        });
      }

      const xpNeeded = Math.floor(100 * Math.pow(1.5, user.level - 1));
      const bar = progressBar(user.xp, xpNeeded, 15);
      const rankPos = await User.countDocuments({ totalXp: { $gt: user.totalXp } }) + 1;

      const embed = EmbedFactory.base(`⭐ **${target.username}'s Rank**`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '🏆 Global Rank', value: `#${rankPos}`, inline: true },
          { name: '🏆 Level', value: String(user.level), inline: true },
          { name: '🏆 Total XP', value: formatNumber(user.totalXp), inline: true },
          {
            name: '📊 Progress to Next Level',
            value: `${formatNumber(user.xp)} / ${formatNumber(xpNeeded)} XP\n\`${bar}\``,
            inline: false,
          }
        );

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:rank')
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
