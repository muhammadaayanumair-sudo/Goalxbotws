'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatAge } = require('../../utils/formatters');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { logger } = require('../../utils/logger');
const { safeErrorMessage } = require('../../utils/teamNameUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('👤 View detailed player profile — no ID needed')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('👤 Player name (e.g. Erling Haaland)').setRequired(true)
    ),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const playerName = interaction.options.getString('name');

      try {
        const results = await api.searchPlayer(playerName);
        if (!results?.length) {
          return interaction.editReply({ embeds: [EmbedFactory.error('Player Not Found', `No player found matching: \`${playerName}\``)] });
        }

        const data   = results[0];
        const player = data.player;
        const stats  = data.statistics?.[0];

        const ratingNum = stats?.games?.rating ? parseFloat(stats.games.rating) : null;
        const ratingStars = ratingNum >= 8 ? '⭐⭐⭐' : ratingNum >= 7 ? '⭐⭐' : ratingNum ? '⭐' : '';

        const embed = EmbedFactory.profile(
          `⚽ **${player.name}**`,
          `*${player.nationality || 'N/A'} · ${formatAge(player.birth?.date)} · ${stats?.games?.position || player.position || 'N/A'}*\n`
        ).setThumbnail(player.photo || null);

        EmbedFactory.addFields(embed, [
          {
            name: '🏟️ Current Club',
            value: stats
              ? `**${stats.team?.name || 'N/A'}**\n🏆 ${stats.league?.name || 'N/A'}${stats.games?.number ? ` · #${stats.games.number}` : ''}`
              : 'N/A',
            inline: true,
          },
          { name: '👤 Physical', value: `📏 ${player.height || 'N/A'}\n⚖️ ${player.weight || 'N/A'}`, inline: true },
        ]);

        if (stats) {
          EmbedFactory.addFields(embed, [
            {
              name: '📊 Season Stats',
              value: EmbedFactory.statBlock([
                ['⚽ Goals', stats.goals?.total || 0],
                ['🅰️ Assists', stats.goals?.assists || 0],
                ['📅 Apps', stats.games?.appearences || 0],
                ['⏱️ Mins', stats.games?.minutes || 0],
              ]),
              inline: true,
            },
            {
              name: '⚡ Discipline',
              value: EmbedFactory.statBlock([
                ['🟨 Yellow', stats.cards?.yellow || 0],
                ['🟥 Red', stats.cards?.red || 0],
                ['🎯 Shots on target', `${stats.shots?.on || 0}/${stats.shots?.total || 0}`],
                ['🎪 Dribbles', `${stats.dribbles?.success || 0}/${stats.dribbles?.attempts || 0}`],
              ]),
              inline: true,
            },
          ]);

          if (ratingNum) {
            EmbedFactory.addFields(embed, [
              { name: '👤 Average Rating', value: `**${ratingNum.toFixed(2)}** ${ratingStars}` },
            ]);
          }
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('refresh:player').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
        );
        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Player Unavailable', safeErrorMessage(err, 'Failed to fetch player info. Please try again later.'))],
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
