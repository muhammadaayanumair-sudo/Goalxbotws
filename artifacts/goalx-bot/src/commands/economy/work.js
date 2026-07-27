'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { EconomyService } = require('../../services/economy/EconomyService');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

const PARTNER_BONUS_RATE = 0.5; // +50%

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('💼 Work a football job to earn GoalCoins'),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      await EconomyService.getUser(interaction.user.id, interaction.user.username);
      const result = await EconomyService.work(interaction.user.id);

      if (!result.success) {
        const minutes = Math.floor(result.remaining / 60_000);
        return interaction.reply({
          embeds: [EmbedFactory.warning('Still Working', `You need to rest before working again!\n\nNext available: **${minutes} minutes**`)],
          ephemeral: true,
        });
      }

      // Partner bonus: +50% on top of base pay
      const userData = await User.findOne({ userId: interaction.user.id }).lean();
      let bonusCoins = 0;
      if (userData?.isPartner) {
        bonusCoins = Math.floor(result.coins * PARTNER_BONUS_RATE);
        const userDoc = await User.findOne({ userId: interaction.user.id });
        userDoc.addCoins(bonusCoins);
        await userDoc.save();
      }

      const totalCoins = result.coins + bonusCoins;

      let desc = `You ${result.job} and earned **${formatCoins(totalCoins)}**!\n\n`;
      if (bonusCoins > 0) {
        desc += `🤝 **Partner Bonus:** +${formatCoins(bonusCoins)} (50% extra)\n\n`;
      }
      if (result.leveledUp) {
        desc += `🎊 **Level Up!** You are now **Level ${result.newLevel}**!\n\n`;
      }
      desc += `*Work again in 1 hour for more coins.*`;

      const embed = EmbedFactory.economy('Work Complete! ⚽').setDescription(desc);

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:work')
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
