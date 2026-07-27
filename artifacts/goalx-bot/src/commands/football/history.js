'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('📜 View a team\'s recent match history')
    .addStringOption((opt) => opt.setName('team').setDescription('📜 Team name').setRequired(true))
    .addIntegerOption((opt) =>
      opt.setName('last')
        .setDescription('📜 Number of past matches (default: 10)')
        .setRequired(false)
        .setMinValue(3)
        .setMaxValue(20)
    ),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const teamName = interaction.options.getString('team');
      const last = interaction.options.getInteger('last') || 10;

      try {
        const teams = await api.searchTeam(teamName);
        if (!teams?.length) return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', `No team found: \`${teamName}\``)] });

        const team = teams[0].team;
        const fixtures = await api.getFixturesByTeam(team.id, last);
        const completed = fixtures?.filter((f) => ['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short)) || [];

        if (!completed.length) {
          return interaction.editReply({ embeds: [EmbedFactory.warning('No History', `No completed matches found for **${team.name}**.`)] });
        }

        const lines = completed.slice(0, last).map((f) => {
          const isHome = f.teams?.home?.id === team.id;
          const myG = isHome ? f.goals?.home ?? 0 : f.goals?.away ?? 0;
          const oppG = isHome ? f.goals?.away ?? 0 : f.goals?.home ?? 0;
          const opp = isHome ? f.teams?.away?.name : f.teams?.home?.name;
          const result = myG > oppG ? '🟢 W' : myG === oppG ? '🟡 D' : '🔴 L';
          const venue = isHome ? '🏠' : '✈️';
          const date = f.fixture?.date ? `<t:${Math.floor(new Date(f.fixture.date).getTime() / 1000)}:D>` : 'N/A';
          return `${result} ${venue} vs **${opp}** — ${myG}-${oppG} — ${date}`;
        });

        const embed = EmbedFactory.base(`📋 **${team.name} — Match History**`)
          .setThumbnail(team.logo)
          .setDescription(`*Last ${completed.length} matches*\n\n${lines.join('\n')}`);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('refresh:history').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
        );
        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Failed to fetch match history.')] });
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
