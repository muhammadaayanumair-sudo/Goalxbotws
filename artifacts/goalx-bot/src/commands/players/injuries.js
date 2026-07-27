'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { logger } = require('../../utils/logger');
const { safeErrorMessage } = require('../../utils/teamNameUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('injuries')
    .setDescription('🏥 View current injury report for a team')
    .addStringOption((opt) =>
      opt.setName('team')
        .setDescription('🏥 Team name (e.g. Manchester City)')
        .setRequired(true)
    ),

  cooldown: 15,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const teamName = interaction.options.getString('team');

      try {
        const teams = await api.searchTeam(teamName);
        if (!teams || teams.length === 0) {
          return interaction.editReply({
            embeds: [EmbedFactory.error('Team Not Found', `No team found: \`${teamName}\``)],
          });
        }

        const team = teams[0].team;
        const injuries = await api.getInjuries(team.id, null);

        if (!injuries || injuries.length === 0) {
          return interaction.editReply({
            embeds: [EmbedFactory.success('All Clear!', `**${team.name}** has no reported injuries or suspensions at this time. 💪`)],
          });
        }

        const injuryLines = injuries.slice(0, 15).map((entry) => {
          const player = entry.player;
          const fixture = entry.fixture;
          const reason = player.reason || player.type || 'Injury';
          const matchDate = fixture?.date
            ? `<t:${Math.floor(new Date(fixture.date).getTime() / 1000)}:D>`
            : 'Unknown';
          return `• **${player.name}** — ${reason} *(reported: ${matchDate})*`;
        });

        const embed = EmbedFactory.base(`🏥 **${team.name} — Injury Report**`)
          .setThumbnail(team.logo || null)
          .setDescription(
            `*${injuries.length} player(s) currently injured or suspended*\n\n` +
            injuryLines.join('\n')
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('refresh:injuries').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
        );
        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Injury Report Unavailable', safeErrorMessage(err, 'Failed to fetch injury report. Please try again later.'))],
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
