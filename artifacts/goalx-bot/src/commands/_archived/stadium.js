'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stadium')
    .setDescription('View stadium information')
    .addStringOption((opt) =>
      opt.setName('team')
        .setDescription('Team whose stadium to look up')
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('name')
        .setDescription('Stadium name to search directly')
        .setRequired(false)
    ),

  cooldown: 10,

  async execute(interaction, client) {
    await interaction.deferReply();
    const api = new FootballApiManager(client.cache);
    const teamInput = interaction.options.getString('team');
    const nameInput = interaction.options.getString('name');

    if (!teamInput && !nameInput) {
      return interaction.editReply({
        embeds: [EmbedFactory.warning('Input Required', 'Please provide a `team` or `name` to search for a stadium.')],
      });
    }

    try {
      let venue = null;
      let teamName = '';

      if (teamInput) {
        const teams = await api.searchTeam(teamInput);
        if (!teams?.length) {
          return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', `No team found: \`${teamInput}\``)] });
        }
        const team = teams[0].team;
        const venueData = await api.getVenueByTeam(team.id);
        venue = venueData?.[0];
        teamName = team.name;
      } else {
        const venueData = await api.searchVenue(nameInput);
        venue = venueData?.[0];
      }

      if (!venue) {
        return interaction.editReply({ embeds: [EmbedFactory.warning('Not Found', 'No stadium data found.')] });
      }

      const embed = EmbedFactory.base(`🏟️ **${venue.name}**`)
        .addFields(
          { name: '📍 Location', value: `${venue.city || 'N/A'}, ${venue.country || 'N/A'}`, inline: true },
          { name: '👥 Capacity', value: venue.capacity?.toLocaleString() || 'N/A', inline: true },
          { name: '🌱 Surface', value: String(venue.surface || 'N/A'), inline: true },
        );

      if (teamName) embed.addFields({ name: '⚽ Home Team', value: `**${teamName}**`, inline: true });
      if (venue.image) embed.setImage(venue.image);

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Failed to fetch stadium data.')] });
    }
  },
};
