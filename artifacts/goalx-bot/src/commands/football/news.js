'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { NewsService } = require('../../services/news/NewsService');
const { truncate } = require('../../utils/formatters');
const { logger } = require('../../utils/logger');

/**
 * Builds the news embed given a title and article list — shared by the
 * initial reply and the refresh-button handler so both stay in sync.
 */
function buildNewsEmbed(title, articles) {
  const embed = EmbedFactory.news(title, `*${articles.length} articles — updated live from NewsAPI.org*\n`);

  for (const article of articles.slice(0, 6)) {
    const desc = truncate(article.description || 'No description available.', 120);
    EmbedFactory.addFields(embed, [{
      name: truncate(article.title, 100),
      value: `${desc}\n[**Read more →**](${article.link}) · *${article.source}*`,
    }]);
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('news')
    .setDescription('📰 View the latest football news from NewsAPI')
    .addStringOption((opt) =>
      opt.setName('search').setDescription('📰 Search by team, player or topic').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('type')
        .setDescription('📰 News type')
        .setRequired(false)
        .addChoices(
          { name: '📰 Latest Headlines',  value: 'latest'    },
          { name: '📰 Transfer News',      value: 'transfers' },
          { name: '📰 Champions League',   value: 'ucl'       },
          { name: '📰 Premier League',    value: 'pl'        },
          { name: '📰 World Football',     value: 'world'     }
        )
    ),

  cooldown: 15,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const newsService = new NewsService(client.cache);
      const searchQuery = interaction.options.getString('search');
      const type        = interaction.options.getString('type') || 'latest';

      try {
        let articles = [];
        let title    = 'Latest Football News';

        if (searchQuery) {
          articles = await newsService.searchNews(searchQuery + ' football');
          title    = `News: ${searchQuery}`;
        } else {
          switch (type) {
            case 'transfers':
              articles = await newsService.getTransferNews(8);
              title    = 'Transfer News & Rumours';
              break;
            case 'ucl':
              articles = await newsService.getLeagueNews('Champions League', 8);
              title    = 'Champions League News';
              break;
            case 'pl':
              articles = await newsService.getLeagueNews('Premier League', 8);
              title    = 'Premier League News';
              break;
            case 'world':
              articles = await newsService.searchNews('world football FIFA', 8);
              title    = 'World Football News';
              break;
            default:
              articles = await newsService.getLatestNews(8);
              title    = 'Latest Football News';
          }
        }

        if (!articles.length) {
          return interaction.editReply({
            embeds: [
              EmbedFactory.warning(
                'No News Found',
                searchQuery ? `No news found for **${searchQuery}**.` : 'No news available right now. Try again shortly.'
              ),
            ],
          });
        }

        const embed = buildNewsEmbed(title, articles);

        // Quick-access buttons
        const sources = [...new Set(articles.slice(0, 5).map((a) => a.source))];
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('news_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
        );

        if (articles[0]?.link) {
          row.addComponents(
            new ButtonBuilder()
              .setLabel(`📰 ${truncate(sources[0] || 'Read Full Article', 60)}`)
              .setStyle(ButtonStyle.Link)
              .setURL(articles[0].link)
          );
        }

        await interaction.editReply({ embeds: [embed], components: [row] });

        // Refresh collector — rebuilds the embed with fresh data, same helper
        const msg = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({
          filter: (i) => i.customId === 'news_refresh' && i.user.id === interaction.user.id,
          time: 120_000,
          max: 3,
        });

        collector.on('collect', async (i) => {
          await i.deferUpdate();
          const fresh = searchQuery
            ? await newsService.searchNews(searchQuery + ' football')
            : await newsService.getLatestNews(8);

          await i.editReply({ embeds: [buildNewsEmbed(title, fresh)], components: [row] });
        });

      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('News Unavailable', err.message || 'Failed to fetch news. Please try again.')],
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
