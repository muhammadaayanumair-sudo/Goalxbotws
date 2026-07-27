'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { NewsService } = require('../../services/news/NewsService');
const { truncate } = require('../../utils/formatters');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transfernews')
    .setDescription('📰 View latest transfer news and rumours from NewsAPI')
    .addStringOption((opt) =>
      opt.setName('team').setDescription('📰 Filter by team name (e.g. Arsenal, Real Madrid)').setRequired(false)
    ),

  cooldown: 15,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const newsService = new NewsService(client.cache);
      const team        = interaction.options.getString('team');

      try {
        const articles = team
          ? await newsService.searchNews(`${team} transfer signing`)
          : await newsService.getTransferNews(8);

        if (!articles.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('No Transfer News', team ? `No transfer news found for **${team}**.` : 'No transfer news right now.')],
          });
        }

        const embed = EmbedFactory.news(
          `Transfer News${team ? ` — ${team}` : ''}`,
          '*Latest transfer rumours & confirmed moves*\n'
        );

        for (const article of articles.slice(0, 6)) {
          EmbedFactory.addFields(embed, [{
            name:  truncate(article.title, 100),
            value: `${truncate(article.description || '', 120)}\n[**Read more →**](${article.link}) · *${article.source}*`,
          }]);
        }

        
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:transfernews')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.editReply({ embeds: [embed] ,
        components: [refreshRow]});
      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('News Unavailable', err.message || 'Failed to fetch transfer news.')],
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
