'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('🏧 Withdraw coins from your bank')
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('🏧 Amount to withdraw').setRequired(true).setMinValue(1)
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const amount = interaction.options.getInteger('amount');
      const user = await User.findOne({ userId: interaction.user.id });

      if (!user) return interaction.reply({ embeds: [EmbedFactory.error('Not Found', 'User not found.')], ephemeral: true });
      if (user.bank < amount) {
        return interaction.reply({
          embeds: [EmbedFactory.error('Insufficient Funds', `You only have ${formatCoins(user.bank)} in your bank.`)],
          ephemeral: true,
        });
      }

      user.bank -= amount;
      user.coins += amount;
      await user.save();

            const helpRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('help:withdraw')
          .setLabel('❓ Help')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        embeds: [EmbedFactory.success('Withdrawn! 💸',
          `${formatCoins(amount)} withdrawn from your bank.\n\n` +
          `💳 Wallet: ${formatCoins(user.coins)}\n🏦 Bank: ${formatCoins(user.bank)}`
        )],
        components: [helpRow],
      });
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
