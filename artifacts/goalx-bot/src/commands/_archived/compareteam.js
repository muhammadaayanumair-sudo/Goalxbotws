'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { CURRENT_SEASON } = require('../../constants/leagues');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('compareteam')
    .setDescription('Compare stats between two football teams')
    .addStringOption((opt) => opt.setName('team1').setDescription('First team').setRequired(true))
    .addStringOption((opt) => opt.setName('team2').setDescription('Second team').setRequired(true)),

  cooldown: 15,

  async execute(interaction, client) {
    await interaction.deferReply();
    const api = new FootballApiManager(client.cache);
    const t1Name = interaction.options.getString('team1');
    const t2Name = interaction.options.getString('team2');

    try {
      const [r1, r2] = await Promise.all([api.searchTeam(t1Name), api.searchTeam(t2Name)]);

      if (!r1?.length) return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', `Team not found: \`${t1Name}\``)] });
      if (!r2?.length) return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', `Team not found: \`${t2Name}\``)] });

      const team1 = r1[0].team;
      const team2 = r2[0].team;

      // Fetch recent fixtures for both
      const [f1, f2, h2h] = await Promise.allSettled([
        api.getFixturesByTeam(team1.id, 10),
        api.getFixturesByTeam(team2.id, 10),
        api.getHeadToHead(team1.id, team2.id, 10),
      ]);

      const calcForm = (fixtures, teamId) => {
        const done = fixtures?.filter((f) => ['FT', 'AET'].includes(f.fixture?.status?.short)) || [];
        return done.slice(0, 5).reduce((acc, f) => {
          const isHome = f.teams?.home?.id === teamId;
          const myG = isHome ? f.goals?.home : f.goals?.away;
          const oppG = isHome ? f.goals?.away : f.goals?.home;
          if (myG > oppG) acc.w++;
          else if (myG === oppG) acc.d++;
          else acc.l++;
          acc.gf += myG ?? 0;
          acc.ga += oppG ?? 0;
          return acc;
        }, { w: 0, d: 0, l: 0, gf: 0, ga: 0 });
      };

      const s1 = calcForm(f1.value, team1.id);
      const s2 = calcForm(f2.value, team2.id);

      // Head-to-head
      const h2hFixtures = h2h.value || [];
      let h1w = 0, h2w = 0, hd = 0;
      h2hFixtures.forEach((f) => {
        const hg = f.goals?.home ?? 0, ag = f.goals?.away ?? 0;
        const t1Home = f.teams?.home?.id === team1.id;
        const t1g = t1Home ? hg : ag, t2g = t1Home ? ag : hg;
        if (t1g > t2g) h1w++;
        else if (t2g > t1g) h2w++;
        else hd++;
      });

      const formEmoji = (stats) => {
        const pts = stats.w * 3 + stats.d;
        return pts >= 12 ? '🔥 Excellent' : pts >= 8 ? '✅ Good' : pts >= 5 ? '⚠️ Average' : '❌ Poor';
      };

      const embed = EmbedFactory.base(`⚔️ **${team1.name}** vs **${team2.name}**`)
        .setThumbnail(team1.logo || team2.logo || null)
        .addFields(
          {
            name: '📊 Last 5 Games',
            value: [
              `**${team1.name}:** W${s1.w} D${s1.d} L${s1.l} GF${s1.gf} GA${s1.ga} — ${formEmoji(s1)}`,
              `**${team2.name}:** W${s2.w} D${s2.d} L${s2.l} GF${s2.gf} GA${s2.ga} — ${formEmoji(s2)}`,
            ].join('\n'),
            inline: false,
          },
          {
            name: `🤝 Head to Head (last ${h2hFixtures.length} games)`,
            value: h2hFixtures.length > 0
              ? `**${team1.name}** wins: ${h1w} | Draws: ${hd} | **${team2.name}** wins: ${h2w}`
              : 'No head-to-head data available',
            inline: false,
          },
          {
            name: '🏟️ Founded',
            value: `**${team1.name}:** ${team1.founded || 'N/A'}\n**${team2.name}:** ${team2.founded || 'N/A'}`,
            inline: true,
          },
          {
            name: '🌍 Country',
            value: `**${team1.name}:** ${team1.country || 'N/A'}\n**${team2.name}:** ${team2.country || 'N/A'}`,
            inline: true,
          }
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Failed to compare teams.')] });
    }
  },
};
