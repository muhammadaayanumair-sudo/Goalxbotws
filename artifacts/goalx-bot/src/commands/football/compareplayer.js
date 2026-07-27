'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('compareplayer')
    .setDescription('⚖️ Compare stats between two players')
    .addStringOption((opt) => opt.setName('player1').setDescription('⚖️ First player name').setRequired(true))
    .addStringOption((opt) => opt.setName('player2').setDescription('⚖️ Second player name').setRequired(true)),

  cooldown: 15,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const p1Name = interaction.options.getString('player1');
      const p2Name = interaction.options.getString('player2');

      try {
        const [r1, r2] = await Promise.all([api.searchPlayer(p1Name), api.searchPlayer(p2Name)]);

        if (!r1?.length) return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', `Player not found: \`${p1Name}\``)] });
        if (!r2?.length) return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', `Player not found: \`${p2Name}\``)] });

        const p1 = r1[0].player;
        const s1 = r1[0].statistics?.[0];
        const p2 = r2[0].player;
        const s2 = r2[0].statistics?.[0];

        const stat = (s, key, sub) => s?.[key]?.[sub] ?? 0;
        const rating = (s) => parseFloat(s?.games?.rating || 0);

        const compareRow = (label, v1, v2) => {
          const n1 = typeof v1 === 'string' ? parseFloat(v1) : v1;
          const n2 = typeof v2 === 'string' ? parseFloat(v2) : v2;
          const winner  = n1 > n2 ? '✅' : n1 < n2 ? '  ' : '🟡';
          const winner2 = n2 > n1 ? '✅' : n2 < n1 ? '  ' : '🟡';
          return `**${label}** | ${winner} ${v1} vs ${v2} ${winner2}`;
        };

        const embed = EmbedFactory.base(`👥 **${p1.name}** vs **${p2.name}**`)
          .setThumbnail(p1.photo || p2.photo || null)
          .addFields(
            {
              name: '📋 Profile',
              value: [
                `**${p1.name}** — ${s1?.team?.name || 'N/A'} · ${p1.nationality || 'N/A'}`,
                `**${p2.name}** — ${s2?.team?.name || 'N/A'} · ${p2.nationality || 'N/A'}`,
              ].join('\n'),
              inline: false,
            },
            {
              name: '⚽ Season Stats Comparison',
              value: [
                compareRow('Goals', stat(s1, 'goals', 'total'), stat(s2, 'goals', 'total')),
                compareRow('Assists', stat(s1, 'goals', 'assists'), stat(s2, 'goals', 'assists')),
                compareRow('Appearances', stat(s1, 'games', 'appearences'), stat(s2, 'games', 'appearences')),
                compareRow('Minutes', stat(s1, 'games', 'minutes'), stat(s2, 'games', 'minutes')),
                compareRow('Key Passes', stat(s1, 'passes', 'key'), stat(s2, 'passes', 'key')),
                compareRow('Dribbles', stat(s1, 'dribbles', 'success'), stat(s2, 'dribbles', 'success')),
                compareRow('Tackles', stat(s1, 'tackles', 'total'), stat(s2, 'tackles', 'total')),
                compareRow('Avg Rating', rating(s1).toFixed(2), rating(s2).toFixed(2)),
              ].join('\n'),
              inline: false,
            }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('refresh:compareplayer').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
        );
        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Failed to compare players.')] });
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
