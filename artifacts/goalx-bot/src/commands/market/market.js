'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const Card = require('../../models/Card');
const User = require('../../models/User');
const { rarityEmoji } = require('../../constants/rarities');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('market')
    .setDescription('🏪 Browse and buy cards on the marketplace')
    .addSubcommand((sub) =>
      sub.setName('browse')
        .setDescription('🏪 Browse cards for sale')
        .addStringOption((opt) =>
          opt.setName('rarity').setDescription('🏪 Filter by rarity').setRequired(false)
            .addChoices(
              { name: '🏪 Common', value: 'common' }, { name: '🏪 Rare', value: 'rare' },
              { name: '🏪 Epic', value: 'epic' }, { name: '🏪 Legendary', value: 'legendary' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub.setName('sell')
        .setDescription('🏪 List your card for sale')
        .addStringOption((opt) => opt.setName('cardid').setDescription('🏪 Card ID to sell').setRequired(true))
        .addIntegerOption((opt) => opt.setName('price').setDescription('🏪 Sale price in coins').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub.setName('buy')
        .setDescription('🏪 Buy a card from the marketplace')
        .addStringOption((opt) => opt.setName('cardid').setDescription('🏪 Card ID to buy').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('delist')
        .setDescription('🏪 Remove your card from sale')
        .addStringOption((opt) => opt.setName('cardid').setDescription('🏪 Card ID to delist').setRequired(true))
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'browse') {
        const rarity = interaction.options.getString('rarity');
        const query = { forSale: true };
        if (rarity) query.rarity = rarity;

        const cards = await Card.find(query).sort({ salePrice: 1 }).limit(15).lean();

        if (!cards.length) {
          return interaction.reply({
            embeds: [EmbedFactory.warning('Empty Market', `No cards currently listed${rarity ? ` (${rarity})` : ''}.`)],
          });
        }

        const embed = EmbedFactory.base(`🛒 **Card Marketplace${rarity ? ` — ${rarity}` : ''}**`)
          .setDescription(`*${cards.length} cards listed for sale*\n`);

        EmbedFactory.addFields(embed, cards.map((card) => ({
          name: `${rarityEmoji(card.rarity)} ${card.playerName} — ${formatCoins(card.salePrice)}`,
          value: `${card.teamName} · OVR ${card.stats?.overall} · ID: \`${card.cardId.slice(0, 8)}\``,
          inline: true,
        })));

        return interaction.reply({ embeds: [embed] });
      }

      if (sub === 'sell') {
        const cardId = interaction.options.getString('cardid');
        const price = interaction.options.getInteger('price');

        const card = await Card.findOne({ cardId, ownerId: interaction.user.id });
        if (!card) return interaction.reply({ embeds: [EmbedFactory.error('Not Found', 'Card not found or not owned by you.')], ephemeral: true });
        if (card.locked) return interaction.reply({ embeds: [EmbedFactory.error('Locked', 'This card is locked.')], ephemeral: true });
        if (card.inAuction) return interaction.reply({ embeds: [EmbedFactory.error('In Auction', 'This card is already in an auction.')], ephemeral: true });

        card.forSale = true;
        card.salePrice = price;
        await card.save();

        return interaction.reply({
          embeds: [EmbedFactory.success('Card Listed! 🛒', `**${card.playerName}** is now listed for ${formatCoins(price)}.\n\nOthers can buy it with \`/market buy ${card.cardId.slice(0, 8)}\``)],
        });
      }

      if (sub === 'buy') {
        await interaction.deferReply();
        const cardIdInput = interaction.options.getString('cardid');
        const card = await Card.findOne({ cardId: { $regex: `^${cardIdInput}` }, forSale: true });

        if (!card) return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', 'Card not found or not for sale.')] });
        if (card.ownerId === interaction.user.id) return interaction.editReply({ embeds: [EmbedFactory.error('Error', 'You cannot buy your own card.')] });

        const buyer = await User.findOne({ userId: interaction.user.id });
        if (!buyer.deductCoins(card.salePrice)) {
          return interaction.editReply({ embeds: [EmbedFactory.error('Insufficient Coins', `You need ${formatCoins(card.salePrice)}.`)] });
        }

        // Pay the seller
        await User.findOneAndUpdate({ userId: card.ownerId }, { $inc: { coins: card.salePrice, totalEarned: card.salePrice } });

        card.previousOwners.push(card.ownerId);
        card.ownerId = interaction.user.id;
        card.forSale = false;
        card.salePrice = null;
        card.timesTraded += 1;
        card.obtainedFrom = 'market';
        await card.save();

        await buyer.save();

        await interaction.editReply({
          embeds: [EmbedFactory.success('Card Purchased! 🎉', `You bought **${card.playerName}** (${card.rarity}) for ${formatCoins(card.salePrice || 0)}!`)],
        });
      }

      if (sub === 'delist') {
        const cardId = interaction.options.getString('cardid');
        const card = await Card.findOne({ cardId, ownerId: interaction.user.id });

        if (!card) return interaction.reply({ embeds: [EmbedFactory.error('Not Found', 'Card not found or not owned by you.')], ephemeral: true });

        card.forSale = false;
        card.salePrice = null;
        await card.save();

        return interaction.reply({ embeds: [EmbedFactory.success('Delisted', `**${card.playerName}** has been removed from the marketplace.`)], ephemeral: true });
      }
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
