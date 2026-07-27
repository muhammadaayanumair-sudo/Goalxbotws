'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatCoins } = require('../../utils/formatters');
const { EmbedFactory } = require('../../utils/embed');
const { EconomyService } = require('../../services/economy/EconomyService');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

const PARTNER_BONUS_RATE = 0.75; // +75%

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('📅 Claim your daily GoalCoins reward'),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      await EconomyService.getUser(interaction.user.id, interaction.user.username);
      const result = await EconomyService.claimDaily(interaction.user.id);

      if (!result.success) {
        const hours   = Math.floor(result.remaining / 3_600_000);
        const minutes = Math.floor((result.remaining % 3_600_000) / 60_000);
        return interaction.reply({
          embeds: [
            EmbedFactory.warning(
              'Already Claimed',
              `You already claimed your daily reward today.\n\n⏱️ Next available: **${hours}h ${minutes}m**`
            ),
          ],
          ephemeral: true,
        });
      }

      // Partner bonus: +75% on top of base reward
      const userData = await User.findOne({ userId: interaction.user.id }).lean();
      let bonusCoins = 0;
      if (userData?.isPartner) {
        bonusCoins = Math.floor(result.coins * PARTNER_BONUS_RATE);
        const userDoc = await User.findOne({ userId: interaction.user.id });
        userDoc.addCoins(bonusCoins);
        await userDoc.save();
      }

      const totalCoins = result.coins + bonusCoins;

      let description = `You received **${formatCoins(totalCoins)}**!\n\n`;
      if (bonusCoins > 0) {
        description += `🤝 **Partner Bonus:** +${formatCoins(bonusCoins)} (75% extra)\n\n`;
      }
      if (result.leveledUp) {
        description += `🎊 **LEVEL UP!** You are now **Level ${result.newLevel}**!\n\n`;
      }
      description += `*Come back tomorrow — rewards increase with your level.*`;

      const embed = EmbedFactory.economy('Daily Reward Claimed! 🎉', description);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('daily_weekly_hint')
          .setLabel('💰 Try /weekly next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      );

      await interaction.reply({ embeds: [embed], components: [row] });
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
