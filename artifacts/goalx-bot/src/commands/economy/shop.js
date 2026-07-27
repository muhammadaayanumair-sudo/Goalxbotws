'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

const SHOP_ITEMS = [
  { id: 'xp_boost_1h', name: '⚡ XP Boost (1h)', description: 'Double XP for 1 hour', price: 500, emoji: '⚡' },
  { id: 'pack_basic', name: '⚪ Basic Pack', description: '3 random football cards', price: 500, emoji: '⚪' },
  { id: 'pack_premium', name: '🔵 Premium Pack', description: '5 cards, better odds', price: 1500, emoji: '🔵' },
  { id: 'pack_elite', name: '🟡 Elite Pack', description: '7 cards, best odds', price: 5000, emoji: '🟡' },
  { id: 'daily_bonus', name: '📅 Daily Bonus Boost', description: '+50% daily reward for 7 days', price: 1000, emoji: '📅' },
  { id: 'bet_insurance', name: '🛡️ Bet Insurance', description: 'Refund if next bet loses', price: 750, emoji: '🛡️' },
  { id: 'card_lock', name: '🔒 Card Lock Token', description: 'Lock a card from being sold', price: 200, emoji: '🔒' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('🛒 Browse and buy items from the GoalX shop')
    .addStringOption((opt) =>
      opt.setName('item')
        .setDescription('🛒 Item ID to purchase')
        .setRequired(false)
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const itemId = interaction.options.getString('item');

      if (!itemId) {
        // Display shop
        const embed = EmbedFactory.economy('**GoalX Shop**')
          .setDescription('🛒 *Purchase items using GoalCoins · Use `/shop item:<item_id>` to buy*\n');

        for (const item of SHOP_ITEMS) {
          embed.addFields({
            name: `${item.emoji} **${item.name}** — ${formatCoins(item.price)}`,
            value: `*${item.description}*\n**ID:** \`${item.id}\``,
            inline: true,
          });
        }

        return interaction.reply({ embeds: [embed] });
      }

      // Purchase item
      const item = SHOP_ITEMS.find((i) => i.id === itemId);
      if (!item) {
        return interaction.reply({
          embeds: [EmbedFactory.error('Item Not Found', `No item with ID \`${itemId}\`. Use \`/shop\` to browse.`)],
          ephemeral: true,
        });
      }

      const user = await User.findOne({ userId: interaction.user.id });
      if (!user) return interaction.reply({ embeds: [EmbedFactory.error('Error', 'User not found.')], ephemeral: true });

      if (!user.deductCoins(item.price)) {
        return interaction.reply({
          embeds: [EmbedFactory.error('Insufficient Coins', `You need ${formatCoins(item.price)} to buy **${item.name}**.\nYou have ${formatCoins(user.coins)}.`)],
          ephemeral: true,
        });
      }

      // Handle pack purchases by redirecting to openpack
      if (item.id.startsWith('pack_')) {
        const packType = item.id.replace('pack_', '');
        // Add to user inventory instead (actual pack open via /openpack)
        user.inventory.push({ itemId: item.id, name: item.name, quantity: 1 });
      } else {
        user.inventory.push({ itemId: item.id, name: item.name, quantity: 1 });
      }

      await user.save();

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:shop')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        embeds: [EmbedFactory.success(`Purchased: ${item.emoji} ${item.name}`, `You bought **${item.name}** for ${formatCoins(item.price)}!\n\n${item.description}\n\nUse \`/inventory\` to view your items.`)],
        components: [refreshRow],
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
