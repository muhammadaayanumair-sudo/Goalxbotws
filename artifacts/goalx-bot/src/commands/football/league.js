'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { LEAGUES, DEFAULT_LEAGUES, CURRENT_SEASON } = require('../../constants/leagues');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('league')
    .setDescription('🏆 View league information and current season details')
    .addStringOption((opt) =>
      opt.setName('name')
        .setDescription('🏆 League name (e.g. Premier League, La Liga)')
        .setRequired(false)
    ),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const nameInput = interaction.options.getString('name');

      try {
        if (!nameInput) {
          // List default leagues
          const lines = DEFAULT_LEAGUES.map((l) => `${l.flag} **${l.name}** — ${l.country}`);
          const embed = EmbedFactory.base('🌍 **Major Football Leagues**')
            .setDescription(lines.join('\n'))
            .setFooter({ text: '⚽ Powered by GoalX · Use /league <name> for details on a specific league' });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('refresh:league').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
          );
          return interaction.editReply({ embeds: [embed], components: [row] });
        }

        // Find league
        let leagueId;
        const key = Object.keys(LEAGUES).find((k) =>
          LEAGUES[k].name.toLowerCase().includes(nameInput.toLowerCase())
        );
        if (key) {
          leagueId = LEAGUES[key].id;
        } else {
          const results = await api.searchLeague(nameInput);
          if (!results?.length) {
            return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', `No league found: \`${nameInput}\``)] });
          }
          leagueId = results[0].league?.id;
        }

        const data = await api.getLeagueById(leagueId);
        const leagueData = data?.[0];
        if (!leagueData) {
          return interaction.editReply({ embeds: [EmbedFactory.warning('No Data', 'Could not find league details.')] });
        }

        const league = leagueData.league;
        const country = leagueData.country;
        const currentSeason = leagueData.seasons?.find((s) => s.current);

        const embed = EmbedFactory.base(`🏆 **${league.name}**`)
          .setThumbnail(league.logo || null)
          .addFields(
            { name: '🏆 Country', value: `${country?.flag || ''} ${country?.name || 'N/A'}`, inline: true },
            { name: '🏆 Type', value: league.type || 'League', inline: true },
            {
              name: '🗓️ Current Season',
              value: currentSeason
                ? [
                    `**Season:** ${currentSeason.year}`,
                    `**Start:** ${currentSeason.start || 'N/A'}`,
                    `**End:** ${currentSeason.end || 'N/A'}`,
                    `**Coverage:** ${currentSeason.coverage?.standings ? '✅ Standings' : ''}`,
                  ].join('\n')
                : '*No active season*',
              inline: false,
            }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('refresh:league').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
        );
        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Failed to fetch league info.')] });
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
