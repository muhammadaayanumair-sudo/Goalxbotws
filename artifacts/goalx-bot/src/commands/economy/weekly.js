'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { EconomyService } = require('../../services/economy/EconomyService');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weekly')
    .setDescription('📅 Claim your weekly GoalCoins reward'),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      await EconomyService.getUser(interaction.user.id, interaction.user.username);
      const result = await EconomyService.claimWeekly(interaction.user.id);

      if (!result.success) {
        const days = Math.floor(result.remaining / 86_400_000);
        const hours = Math.floor((result.remaining % 86_400_000) / 3_600_000);
        return interaction.reply({
          embeds: [EmbedFactory.warning('Already Claimed', `You already claimed your weekly reward!\n\nNext available: **${days}d ${hours}h**`)],
          ephemeral: true,
        });
      }

      const embed = EmbedFactory.economy('Weekly Reward Claimed! 🎊')
        .setDescription(
          `You received ${formatCoins(result.coins)}!\n\n` +
          (result.leveledUp ? `🎊 **Level Up!** You are now **Level ${result.newLevel}**!\n\n` : '') +
          `*Weekly rewards are 5x larger than daily — keep coming back!*`
        );

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:weekly')
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
