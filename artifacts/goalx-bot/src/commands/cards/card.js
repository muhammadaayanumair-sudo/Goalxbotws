'use strict';

const { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { CardService } = require('../../services/cards/CardService');
const { rarityColor, rarityEmoji } = require('../../constants/rarities');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('card')
    .setDescription('🃏 View a specific football card in detail')
    .addStringOption((opt) =>
      opt.setName('cardid').setDescription('🃏 Card ID (first 8 characters)').setRequired(true)
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const cardIdInput = interaction.options.getString('cardid');
      const cardService = new CardService(client.cache);

      const Card = require('../../models/Card');
  const { logger } = require('../../utils/logger');
      const card = await Card.findOne({ cardId: { $regex: `^${cardIdInput}` } }).lean();

      if (!card) {
        return interaction.reply({ embeds: [EmbedFactory.error('Not Found', `No card found with ID starting with \`${cardIdInput}\``)], ephemeral: true });
      }

      const rEmoji = rarityEmoji(card.rarity);

      const embed = EmbedFactory.card(`${rEmoji} **${card.playerName}**`)
        .setColor(rarityColor(card.rarity))
        .setDescription(`*${card.rarity.toUpperCase()} · Season ${card.season}*\n`);

      EmbedFactory.addFields(embed, [
        { name: '🃏 Team', value: card.teamName, inline: true },
        { name: '🃏 Position', value: card.position || 'N/A', inline: true },
        { name: '🃏 Nationality', value: card.nationality || 'N/A', inline: true },
        { name: '🃏 Rarity', value: `${rEmoji} ${card.rarity.toUpperCase()}`, inline: true },
        { name: '🃏 Season', value: card.season, inline: true },
        { name: '🃏 Traded', value: `${card.timesTraded} times`, inline: true },
        {
          name: '📊 Stats',
          value: [
            `**OVR** ${card.stats.overall} | **PAC** ${card.stats.pace} | **SHO** ${card.stats.shooting}`,
            `**PAS** ${card.stats.passing} | **DRI** ${card.stats.dribbling} | **DEF** ${card.stats.defending} | **PHY** ${card.stats.physical}`,
          ].join('\n'),
        },
        {
          name: '💰 Market',
          value: card.forSale
            ? `🛒 For Sale: **${card.salePrice?.toLocaleString()} coins**`
            : card.inAuction
              ? `🔨 In Auction`
              : `🔒 In Collection`,
        },
      ]);

      embed.setFooter({ text: `⚽ Powered by GoalX · Card #${card.cardId.slice(0, 8)} · Obtained via ${card.obtainedFrom}` });

            const helpRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('help:card')
          .setLabel('❓ Help')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed] ,
        components: [helpRow]});
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
