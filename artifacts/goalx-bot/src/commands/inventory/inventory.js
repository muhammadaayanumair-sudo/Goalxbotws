'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('🎒 View your item inventory'),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const user = await User.findOne({ userId: interaction.user.id }).lean();

      if (!user || !user.inventory?.length) {
        return interaction.reply({
          embeds: [EmbedFactory.warning('Empty Inventory', 'Your inventory is empty.\n\nVisit the `/shop` to buy items!')],
          ephemeral: true,
        });
      }

      // Group by item ID
      const grouped = {};
      for (const item of user.inventory) {
        if (!grouped[item.itemId]) {
          grouped[item.itemId] = { ...item, count: 0 };
        }
        grouped[item.itemId].count += item.quantity || 1;
      }

      const embed = EmbedFactory.base('🎒 **Your Inventory**')
        .setDescription(`*${user.inventory.length} item(s)*\n`);

      for (const item of Object.values(grouped)) {
        embed.addFields({
          name: `**${item.name}** x${item.count}`,
          value: `*Obtained: ${new Date(item.acquiredAt).toLocaleDateString()}*`,
          inline: true,
        });
      }

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:inventory')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.reply({ embeds: [embed], ephemeral: true ,
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
