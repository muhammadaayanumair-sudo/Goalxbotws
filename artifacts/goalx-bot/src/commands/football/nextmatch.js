'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { timeUntilMatch } = require('../../utils/formatters');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nextmatch')
    .setDescription('⏭️ View the next upcoming match for a team')
    .addStringOption((opt) =>
      opt.setName('team').setDescription('⏭️ Team name').setRequired(true)
    ),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const teamName = interaction.options.getString('team');

      try {
        const teams = await api.searchTeam(teamName);
        if (!teams?.length) {
          return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', `No team found: \`${teamName}\``)] });
        }

        const team = teams[0].team;
        const fixtures = await api.getFixturesByTeam(team.id, 10);
        const upcoming = fixtures?.find((f) => f.fixture?.status?.short === 'NS');

        if (!upcoming) {
          return interaction.editReply({ embeds: [EmbedFactory.warning('No Upcoming', `No upcoming fixtures found for **${team.name}**.`)] });
        }

        const isHome = upcoming.teams?.home?.id === team.id;
        const opponent = isHome ? upcoming.teams?.away : upcoming.teams?.home;
        const venue = upcoming.fixture?.venue;
        const kickoff = upcoming.fixture?.date;
        const kickoffTs = Math.floor(new Date(kickoff).getTime() / 1000);
        const countdown = timeUntilMatch(kickoff);

        const embed = EmbedFactory.base(`⏱️ **${team.name} — Next Match**`)
          .setThumbnail(team.logo)
          .addFields(
            {
              name: '⚽ Fixture',
              value: isHome
                ? `🏠 **${team.name}** vs ${opponent?.name}`
                : `✈️ ${opponent?.name} vs **${team.name}**`,
              inline: false,
            },
            { name: '⏭️ Competition', value: upcoming.league?.name || 'N/A', inline: true },
            { name: '⏭️ Kickoff', value: `<t:${kickoffTs}:F>`, inline: true },
            { name: '⏭️ Countdown', value: countdown, inline: true },
            { name: '⏭️ Venue', value: venue?.name ? `${venue.name}, ${venue.city}` : 'TBC', inline: false }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('refresh:nextmatch')
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Failed to fetch next match.')] });
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
