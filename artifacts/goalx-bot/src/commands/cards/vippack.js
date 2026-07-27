'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { CardService } = require('../../services/cards/CardService');
const { requirePartner } = require('../../utils/partnerGuard');
const config = require('../../config/config');
const { rarityColor, rarityEmoji, highestRarity } = require('../../constants/rarities');
const { logger } = require('../../utils/logger');

/**
 * /vippack — Partner-exclusive card pack.
 * 10 cards, guaranteed epic+, elevated legendary/limited odds.
 * Cost: 8,000 coins.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('vippack')
    .setDescription('💎 [Partner] Open the exclusive VIP pack — guaranteed epic+ cards (8,000 coins)'),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      await interaction.deferReply();

      const cardService = new CardService(client.cache);

      try {
        const { cards, coinsSpent } = await cardService.openPack(interaction.user.id, 'vip');

        const cardLines = cards.map((c) =>
          `${rarityEmoji(c.rarity)} **${c.playerName}** · ${c.position} · OVR **${c.stats?.overall ?? '??'}** · \`${c.rarity.toUpperCase()}\``
        );

        const topRarity = highestRarity(cards);

        const embed = new EmbedBuilder()
          .setColor(rarityColor(topRarity))
          .setTitle('👑 VIP Partner Pack Opened!')
          .setDescription(
            `Spent **${formatCoins(coinsSpent)}** → received **${cards.length} cards**\n\n` +
            cardLines.join('\n')
          )
          .addFields({
            name: '📊 Pack Odds',
            value: '`0%` Common · `10%` Rare · `45%` Epic · `35%` Legendary · `10%` Limited',
            inline: false,
          })
          .setFooter({ text: '⚽ GoalX VIP Pack · Partner Exclusive' })
          .setTimestamp();

        
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:vippack')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.editReply({ embeds: [embed] ,
        components: [refreshRow]});
      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('VIP Pack Failed', err.message || 'Could not open VIP pack.')],
        });
      }
    } catch (error) {
    const isExpiredInteraction = error.code === 10062;
    if (!isExpiredInteraction) {
      logger.error(`[${interaction.commandName}] execute error:`, error);
    }
    try {
      const msg = {
        embeds: [EmbedFactory.error('Something went wrong', error.message || 'An unexpected error occurred.')],
        flags: 64,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else if (!isExpiredInteraction) {
        await interaction.reply(msg);
      }
    } catch (_) { /* interaction already expired */ }
  }
},
};
