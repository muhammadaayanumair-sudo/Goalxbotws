'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { rarityEmoji, rarityColor } = require('../../constants/rarities');
const { CardService } = require('../../services/cards/CardService');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pack')
    .setDescription('Open a card pack to get player cards')
    .addStringOption((opt) =>
      opt.setName('type')
        .setDescription('Pack type to open')
        .addChoices(
          { name: 'Basic (500 ⚽)', value: 'basic' },
          { name: 'Premium (1500 ⚽)', value: 'premium' },
          { name: 'Elite (5000 ⚽)', value: 'elite' },
        )
        .setRequired(false)
    ),

  cooldown: 10,

  async execute(interaction, client) {
    await interaction.deferReply();

    const packType = interaction.options.getString('type') || 'basic';
    const cardService = new CardService(client.cache);

    try {
      const { cards, coinsSpent } = await cardService.openPack(interaction.user.id, packType);

      const packNames = { basic: 'Basic Pack', premium: 'Premium Pack', elite: 'Elite Pack' };
      const packEmoji = { basic: '📦', premium: '💎', elite: '👑' };

      const cardLines = cards.map((c) =>
      `${rarityEmoji(c.rarity)} **${c.playerName}** (${c.position}) — OVR **${c.stats.overall}** | ${c.rarity.toUpperCase()}`
    );

    const topRarity = cards.reduce((best, c) => {
      const order = ['common', 'rare', 'epic', 'legendary', 'limited', 'seasonal'];
      return order.indexOf(c.rarity) > order.indexOf(best) ? c.rarity : best;
    }, 'common');

    const colorHex = rarityColor(topRarity);
    const colorInt = parseInt(colorHex.replace('#', ''), 16);

    const embed = new EmbedBuilder()
      .setColor(colorInt)
      .setTitle(`${packEmoji[packType]} ${packNames[packType]} Opened!`)
      .setDescription(cardLines.join('\n'))
      .setFooter({ text: `GoalX ⚽ | ${cards.length} cards received · ${coinsSpent.toLocaleString()} coins spent` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({
        embeds: [EmbedFactory.error('Pack Failed', err.message || 'Could not open pack. Please try again.')],
      });
    }
  },
};
