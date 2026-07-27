'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { formatMatchStatus } = require('../../utils/formatters');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('livescores')
    .setDescription('🔴 Quick glance at all live scores — no ID needed')
    .addStringOption((opt) =>
      opt.setName('league').setDescription('🔴 Filter to a specific league name').setRequired(false)
    ),

  cooldown: 20,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const leagueFilter = interaction.options.getString('league');

      try {
        const matches = await api.getLiveMatches();

        if (!matches?.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('No Live Matches', '*No matches are currently live. Check back during match times, or use `/fixtures` for today\'s schedule.*')],
          });
        }

        const filtered = leagueFilter
          ? matches.filter((m) => m.league?.name?.toLowerCase().includes(leagueFilter.toLowerCase()))
          : matches;

        if (!filtered.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('No Matches', `No live matches found for: \`${leagueFilter}\``)],
          });
        }

        // Group by league for cleaner scanning
        const byLeague = {};
        for (const m of filtered) {
          const key = m.league?.name || 'Unknown';
          if (!byLeague[key]) byLeague[key] = [];
          byLeague[key].push(m);
        }

        const embed = EmbedFactory.live(`Live Scores — ${filtered.length} match${filtered.length !== 1 ? 'es' : ''}`);
        embed.setFooter({ text: '⚽ Powered by GoalX · Updates every 60s · Use /livematch for full match details' });

        const leagueEntries = Object.entries(byLeague);
        const shown = leagueEntries.slice(0, EmbedFactory.limits.MAX_FIELDS);

        for (const [league, ms] of shown) {
          const lines = ms.map((m) => {
            const minute = m.fixture?.status?.elapsed ? `${m.fixture.status.elapsed}'` : formatMatchStatus(m.fixture?.status?.short);
            const hg = m.goals?.home ?? 0;
            const ag = m.goals?.away ?? 0;
            return `• **${m.teams?.home?.name} ${hg}-${ag} ${m.teams?.away?.name}** · ⏱️ ${minute}`;
          });
          EmbedFactory.addFields(embed, [{ name: `🏆 ${league}`, value: lines.join('\n') }]);
        }

        if (leagueEntries.length > shown.length) {
          embed.setDescription(`*+${leagueEntries.length - shown.length} more league(s) not shown — use \`/livescores league:<name>\` to filter*`);
        }

        
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:livescores')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.editReply({ embeds: [embed] ,
        components: [refreshRow]});
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Failed to fetch live scores.')] });
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
