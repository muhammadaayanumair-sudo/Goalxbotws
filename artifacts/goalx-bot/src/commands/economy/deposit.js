'use strict';

const { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('🏦 Deposit coins into your bank for safekeeping')
    .addIntegerOption((opt) =>
      opt.setName('amount')
        .setDescription('Amount to deposit (or "all")')
        .setRequired(true)
        .setMinValue(1)
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const amount = interaction.options.getInteger('amount');
      const user = await User.findOne({ userId: interaction.user.id });

      if (!user) return interaction.reply({ embeds: [EmbedFactory.error('Not Found', 'User not found.')], ephemeral: true });
      if (user.coins < amount) {
        return interaction.reply({
          embeds: [EmbedFactory.error('Insufficient Coins', `You only have ${formatCoins(user.coins)} in your wallet.`)],
          ephemeral: true,
        });
      }

      user.coins -= amount;
      user.bank += amount;
      await user.save();

            const helpRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('help:deposit')
          .setLabel('❓ Help')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        embeds: [EmbedFactory.success('Deposited! 🏦',
          `${formatCoins(amount)} deposited to your bank.\n\n` +
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
