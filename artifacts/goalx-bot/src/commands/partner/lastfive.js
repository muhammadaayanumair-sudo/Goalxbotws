'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { requirePartner } = require('../../utils/partnerGuard');
const { formatFormResult } = require('../../utils/formatters');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lastfive')
    .setDescription('🤝 Partner-only: detailed last 5 matches of a team')
    .addStringOption((opt) =>
      opt.setName('team').setDescription('🏟️ Team name').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('count')
        .setDescription('📊 Number of matches (3-15, default 5)')
        .setRequired(false)
        .setMinValue(3)
        .setMaxValue(15)
    ),

  cooldown: 15,

  async execute(interaction, client) {
    try {
      if (!await requirePartner(interaction)) return;
      await interaction.deferReply();

      const api = new FootballApiManager(client.cache);
      const teamName = interaction.options.getString('team');
      const count = interaction.options.getInteger('count') || 5;

      try {
        const teams = await api.searchTeam(teamName);
        if (!teams?.length) {
          return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', `No team found: \`${teamName}\``)] });
        }

        const team = teams[0].team;
        const fixtures = await api.getFixturesByTeam(team.id, count);
        if (!fixtures?.length) {
          return interaction.editReply({ embeds: [EmbedFactory.warning('No Matches', `No recent matches found for **${team.name}**.`)] });
        }

        const lines = fixtures.map((f) => {
          const home = f.teams?.home?.name;
          const away = f.teams?.away?.name;
          const hg = f.goals?.home ?? '-';
          const ag = f.goals?.away ?? '-';
          const status = f.fixture?.status?.short;
          const date = f.fixture?.date ? `<t:${Math.floor(new Date(f.fixture.date).getTime() / 1000)}:D>` : '';

          const isHome = f.teams?.home?.id === team.id;
          const teamGoals = isHome ? hg : ag;
          const oppGoals = isHome ? ag : hg;
          let result = 'D';
          if (teamGoals > oppGoals) result = 'W';
          else if (teamGoals < oppGoals) result = 'L';
          else if (teamGoals === '-' || oppGoals === '-') result = 'NS';

          return `${formatFormResult(result)} **${home} ${hg}–${ag} ${away}** · ${status} · ${date}`;
        }).join('\n');

        const embed = EmbedFactory.base(`📊 **${team.name} — Last ${fixtures.length} Matches**`)
          .setThumbnail(team.logo || null)
          .setDescription(lines)
          .setFooter({ text: '⚽ GoalX Partner · Last Five' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('refresh:lastfive').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Failed to fetch matches.')] });
      }
    } catch (error) {
      logger.error(`[${interaction.commandName}] execute error:`, error);
      const msg = { embeds: [EmbedFactory.error('Error', error.message || 'Something went wrong.')], flags: 64 };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
