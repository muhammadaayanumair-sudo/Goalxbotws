'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { formatAge } = require('../../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coach')
    .setDescription('View the head coach/manager of a team')
    .addStringOption((opt) =>
      opt.setName('team').setDescription('Team name').setRequired(true)
    ),

  cooldown: 10,

  async execute(interaction, client) {
    await interaction.deferReply();
    const api = new FootballApiManager(client.cache);
    const teamName = interaction.options.getString('team');

    try {
      const teams = await api.searchTeam(teamName);
      if (!teams?.length) {
        return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', `No team found: \`${teamName}\``)] });
      }

      const team = teams[0].team;
      const coaches = await api.getCoachByTeam(team.id);
      const coach = coaches?.[0];

      if (!coach) {
        return interaction.editReply({ embeds: [EmbedFactory.warning('No Data', `No coach data available for **${team.name}**.`)] });
      }

      const embed = EmbedFactory.base(`👨‍💼 **${team.name} — Head Coach**`)
        .setThumbnail(coach.photo || team.logo)
        .setDescription(`**${coach.name || 'N/A'}**\n`)
        .addFields(
          { name: '🌍 Nationality', value: coach.nationality || 'N/A', inline: true },
          { name: '🎂 Age', value: formatAge(coach.birth?.date), inline: true },
          { name: '📅 Born', value: `${coach.birth?.place || 'N/A'}, ${coach.birth?.country || ''}`, inline: true }
        );

      if (coach.career?.length) {
        const recent = coach.career.slice(0, 5).map((c) => {
          const start = c.start ? c.start.slice(0, 4) : '?';
          const end = c.end ? c.end.slice(0, 4) : 'present';
          return `• **${c.team?.name}** *(${start}–${end})*`;
        });
        embed.addFields({ name: '📋 Career History', value: recent.join('\n'), inline: false });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Failed to fetch coach data.')] });
    }
  },
};
