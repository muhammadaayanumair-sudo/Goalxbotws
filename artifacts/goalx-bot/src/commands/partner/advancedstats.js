'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { resolveMatchByName } = require('../../utils/matchLookup');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('advancedstats')
    .setDescription('🤝 Partner-only: advanced match statistics and xG analysis')
    .addStringOption((opt) =>
      opt.setName('match').setDescription('📈 Match name, e.g. Arsenal vs Chelsea').setRequired(true)
    ),

  cooldown: 15,

  async execute(interaction, client) {
    try {
      if (!await requirePartner(interaction)) return;
      await interaction.deferReply();

      const api = new FootballApiManager(client.cache);
      const matchQuery = interaction.options.getString('match');

      try {
        const fixture = await resolveMatchByName(api, matchQuery);
        const matchId = fixture.fixture?.id;
        const statsData = await api.getFixtureStatistics(matchId);

        const homeName = fixture.teams?.home?.name || 'Home';
        const awayName = fixture.teams?.away?.name || 'Away';
        const hg = fixture.goals?.home ?? 0;
        const ag = fixture.goals?.away ?? 0;

        const embed = EmbedFactory.base(`📊 **${homeName} ${hg}-${ag} ${awayName}** — Advanced Stats`)
          .setDescription('📈 *Partner-only advanced statistics*');

        if (!statsData?.length) {
          embed.setDescription('📈 *No detailed statistics available for this match yet.*');
          return interaction.editReply({ embeds: [embed] });
        }

        const homeStats = statsData[0]?.statistics || [];
        const awayStats = statsData[1]?.statistics || [];
        const getStat = (arr, type) => arr.find((s) => s.type === type)?.value ?? 'N/A';

        const statRows = [
          ['Ball Possession', 'Ball Possession'],
          ['Total Shots', 'Total Shots'],
          ['Shots on Goal', 'Shots on Goal'],
          ['Shots off Goal', 'Shots off Goal'],
          ['Blocked Shots', 'Blocked Shots'],
          ['Total passes', 'Total passes'],
          ['Passes accurate', 'Passes accurate'],
          ['Fouls', 'Fouls'],
          ['Yellow Cards', 'Yellow Cards'],
          ['Red Cards', 'Red Cards'],
          ['Offsides', 'Offsides'],
          ['Corner Kicks', 'Corner Kicks'],
          ['Goalkeeper Saves', 'Goalkeeper Saves'],
          ['expected_goals', 'expected_goals'],
        ];

        const lines = statRows.map(([label, key]) => {
          const hv = getStat(homeStats, key);
          const av = getStat(awayStats, key);
          return `**${label}:** ${hv} — ${av}`;
        });

        embed.addFields({ name: `📈 ${homeName} vs ${awayName}`, value: lines.join('\n'), inline: false });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('refresh:advancedstats').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Failed to fetch advanced stats.')] });
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
