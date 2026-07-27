'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { logger } = require('../../utils/logger');
const { safeErrorMessage } = require('../../utils/teamNameUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('squad')
    .setDescription('👥 View the full squad for a team')
    .addStringOption((opt) =>
      opt.setName('team').setDescription('👥 Team name').setRequired(true)
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
        const squadData = await api.getTeamSquad(team.id);
        const players = squadData?.[0]?.players || [];

        if (!players.length) {
          return interaction.editReply({ embeds: [EmbedFactory.warning('No Squad', `No squad data for **${team.name}**.`)] });
        }

        // Group by position
        const byPos = { Goalkeeper: [], Defender: [], Midfielder: [], Attacker: [] };
        for (const p of players) {
          const pos = p.position || 'Attacker';
          if (byPos[pos]) byPos[pos].push(p);
        }

        const posEmoji = { Goalkeeper: '🧤', Defender: '🛡️', Midfielder: '⚙️', Attacker: '⚽' };
        const embed = EmbedFactory.base(`👥 **${team.name} — Squad**`)
          .setDescription(`*${players.length} registered players*\n`)
          .setThumbnail(team.logo);

        for (const [pos, list] of Object.entries(byPos)) {
          if (!list.length) continue;
          embed.addFields({
            name: `${posEmoji[pos]} ${pos}s (${list.length})`,
            value: list.slice(0, 8).map((p) => `${p.number ? `#${p.number}` : '—'} **${p.name}** *(${p.age || '?'} yrs)*`).join('\n'),
            inline: true,
          });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('refresh:squad').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
        );
        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Squad Unavailable', safeErrorMessage(err, 'Failed to fetch squad data. Please try again later.'))] });
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
