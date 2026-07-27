'use strict';

const { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { EconomyService } = require('../../services/economy/EconomyService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('💸 Transfer GoalCoins to another user')
    .addUserOption((opt) => opt.setName('user').setDescription('💸 User to pay').setRequired(true))
    .addIntegerOption((opt) => opt.setName('amount').setDescription('💸 Amount to pay').setRequired(true).setMinValue(1)),

  cooldown: 10,

  async execute(interaction, client) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (target.bot) {
      return interaction.reply({ embeds: [EmbedFactory.error('Invalid User', 'You cannot pay a bot.')], ephemeral: true });
    }

    try {
      await EconomyService.transfer(interaction.user.id, target.id, amount);
            const helpRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('help:pay')
          .setLabel('❓ Help')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        embeds: [EmbedFactory.success('Payment Sent! 💸', `You sent ${formatCoins(amount)} to **${target.username}**.`)],
        components: [helpRow],
      });
    } catch (err) {
      await interaction.reply({ embeds: [EmbedFactory.error('Payment Failed', err.message)], ephemeral: true });
    }
  },
};
