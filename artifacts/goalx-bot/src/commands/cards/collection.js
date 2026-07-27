'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { rarityEmoji } = require('../../constants/rarities');
const { formatNumber } = require('../../utils/format');
const Card = require('../../models/Card');
const { logger } = require('../../utils/logger');

const PAGE_SIZE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collection')
    .setDescription('🃏 View your card collection')
    .addStringOption((opt) =>
      opt.setName('rarity')
        .setDescription('🃏 Filter by rarity')
        .addChoices(
          { name: '🃏 All', value: 'all' },
          { name: '🃏 Common', value: 'common' },
          { name: '🃏 Rare', value: 'rare' },
          { name: '🃏 Epic', value: 'epic' },
          { name: '🃏 Legendary', value: 'legendary' },
        )
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName('page').setDescription('🃏 Page number').setMinValue(1).setRequired(false)
    ),

  cooldown: 5,

  async execute(interaction) {
  try {
      await interaction.deferReply();

      const rarity = interaction.options.getString('rarity') || 'all';
      const page = (interaction.options.getInteger('page') || 1) - 1;

      const filter = { userId: interaction.user.id };
      if (rarity !== 'all') filter.rarity = rarity;

      const total = await Card.countDocuments(filter);
      const cards = await Card.find(filter)
        .sort({ 'stats.overall': -1, rarity: -1 })
        .skip(page * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean();

      if (!total) {
        return interaction.editReply({
          embeds: [EmbedFactory.warning('No Cards', 'You have no cards yet! Use `/pack` to open one.')],
        });
      }

      const lines = cards.map((c, i) =>
        `${i + 1 + page * PAGE_SIZE}. ${rarityEmoji(c.rarity)} **${c.playerName}** | OVR **${c.stats.overall}** | ${c.team}`
      );

      const embed = EmbedFactory.stats(`🃏 ${interaction.user.username}'s Collection`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Page ${page + 1}/${Math.ceil(total / PAGE_SIZE)} | Total: ${formatNumber(total)} cards` });

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:collection')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.editReply({ embeds: [embed] ,
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
