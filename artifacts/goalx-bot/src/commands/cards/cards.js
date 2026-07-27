'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { CardService } = require('../../services/cards/CardService');
const { rarityEmoji } = require('../../constants/rarities');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cards')
    .setDescription('🃏 View your football card collection')
    .addUserOption((opt) =>
      opt.setName('user')
        .setDescription('👤 View another user\'s collection')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('rarity')
        .setDescription('🃏 Filter by rarity')
        .setRequired(false)
        .addChoices(
          { name: '🃏 Common', value: 'common' },
          { name: '🃏 Rare', value: 'rare' },
          { name: '🃏 Epic', value: 'epic' },
          { name: '🃏 Legendary', value: 'legendary' },
          { name: '🃏 Limited', value: 'limited' }
        )
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const target = interaction.options.getUser('user') || interaction.user;
      const rarity = interaction.options.getString('rarity');
      const cardService = new CardService(client.cache);

      let page = 1;
      const limit = 9;

      const buildEmbed = async (currentPage) => {
        const { cards, total, pages } = await cardService.getUserCards(target.id, { rarity, page: currentPage, limit });

        if (total === 0) {
          return {
            embed: EmbedFactory.card('Empty Collection')
              .setDescription(`*${target.id === interaction.user.id ? 'You have' : `**${target.username}** has`} no cards yet.*\n\nUse \`/openpack\` to open your first pack!`),
            pages: 0,
          };
        }

        const embed = EmbedFactory.card(
          `**${target.id === interaction.user.id ? 'Your' : `${target.username}'s`} Collection${rarity ? ` — ${rarity}` : ''}**`
        )
          .setDescription(`*${total} cards total · Page ${currentPage}/${pages}*`)
          .setThumbnail(target.displayAvatarURL());

        EmbedFactory.addFields(embed, cards.map((card) => ({
          name: `${rarityEmoji(card.rarity)} **${card.playerName}** — OVR ${card.stats.overall}`,
          value: `*${card.teamName} · ${card.position}*\n${card.forSale ? `💰 For Sale: ${card.salePrice?.toLocaleString()} coins` : card.inAuction ? '🔨 In Auction' : '🔒 In Collection'}`,
          inline: true,
        })));

        return { embed, pages };
      };

      const { embed, pages } = await buildEmbed(page);
      const buildRow = (currentPage, totalPages) => {
        const prev = new ButtonBuilder().setCustomId('cards_prev').setLabel('⬅️ Prev').setStyle(ButtonStyle.Secondary).setDisabled(currentPage <= 1);
        const next = new ButtonBuilder().setCustomId('cards_next').setLabel('Next ➡️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= totalPages);
        return new ActionRowBuilder().addComponents(prev, next);
      };

      const row = pages > 1 ? buildRow(page, pages) : null;
      const components = row ? [row] : [];

      const msg = await interaction.editReply({ embeds: [embed], components });

      if (pages <= 1) return;

      const collector = msg.createMessageComponentCollector({
        filter: (i) => ['cards_prev', 'cards_next'].includes(i.customId) && i.user.id === interaction.user.id,
        time: 120_000,
      });

      let currentPages = pages;

      collector.on('collect', async (i) => {
        await i.deferUpdate();
        if (i.customId === 'cards_prev') page = Math.max(1, page - 1);
        else page = Math.min(currentPages, page + 1);

        const { embed: newEmbed, pages: newPages } = await buildEmbed(page);
        currentPages = newPages;
        await i.editReply({ embeds: [newEmbed], components: [buildRow(page, currentPages)] });
      });

      collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
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
