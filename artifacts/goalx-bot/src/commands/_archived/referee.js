'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { resolveMatchByName } = require('../../utils/matchLookup');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('referee')
    .setDescription('View referee information for an upcoming or recent match')
    .addStringOption((opt) =>
      opt.setName('match')
        .setDescription('Match name, e.g. Arsenal vs Chelsea')
        .setRequired(true)
    ),

  cooldown: 10,

  async execute(interaction, client) {
    await interaction.deferReply();
    const api = new FootballApiManager(client.cache);
    const matchQuery = interaction.options.getString('match');

    try {
      const fixture = await resolveMatchByName(api, matchQuery);

      const referee  = fixture.fixture?.referee || 'Not Announced';
      const homeName = fixture.teams?.home?.name;
      const awayName = fixture.teams?.away?.name;
      const league   = fixture.league?.name;
      const date     = fixture.fixture?.date
        ? `<t:${Math.floor(new Date(fixture.fixture.date).getTime() / 1000)}:F>`
        : 'TBD';

      const embed = EmbedFactory.base(`🟡 **${homeName}** vs **${awayName}**`)
        .setDescription('*Match Officials*\n')
        .addFields(
          { name: '🏆 Competition', value: league || 'N/A', inline: true },
          { name: '📅 Date',        value: date,            inline: true },
          { name: '🟡 Referee',     value: `**${referee}**`, inline: false }
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({
        embeds: [EmbedFactory.error('Not Found', err.message || 'Failed to fetch referee data.')],
      });
    }
  },
};
