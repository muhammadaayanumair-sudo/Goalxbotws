'use strict';

const { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { CardService } = require('../../services/cards/CardService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('💸 Sell a card directly for GoalCoins')
    .addStringOption((opt) =>
      opt.setName('cardid').setDescription('💸 Card ID to sell (first 8 chars)').setRequired(true)
    ),

  cooldown: 5,

  async execute(interaction, client) {
    const cardIdInput = interaction.options.getString('cardid');
    const cardService = new CardService(client.cache);

    const Card = require('../../models/Card');
    const card = await Card.findOne({
      cardId: { $regex: `^${cardIdInput}` },
      ownerId: interaction.user.id,
    }).lean();

    if (!card) {
      return interaction.reply({ embeds: [EmbedFactory.error('Not Found', 'Card not found or not owned by you.')], ephemeral: true });
    }

    if (card.locked) return interaction.reply({ embeds: [EmbedFactory.error('Locked', 'This card is locked and cannot be sold.')], ephemeral: true });
    if (card.inAuction) return interaction.reply({ embeds: [EmbedFactory.error('In Auction', 'This card is currently in an auction.')], ephemeral: true });

    try {
      const { value } = await cardService.sellCard(card.cardId, interaction.user.id);

            const helpRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('help:sell')
          .setLabel('❓ Help')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        embeds: [EmbedFactory.success(`Card Sold! 💰`,
          `**${card.playerName}** (${card.rarity}) has been sold for ${formatCoins(value)}!\n\n*Use \`/balance\` to see your updated wallet.*`
        )],
        components: [helpRow],
      });
    } catch (err) {
      await interaction.reply({ embeds: [EmbedFactory.error('Sell Failed', err.message)], ephemeral: true });
    }
  },
};
