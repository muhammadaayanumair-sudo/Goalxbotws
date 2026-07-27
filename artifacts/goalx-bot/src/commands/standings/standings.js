'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { LEAGUES, CURRENT_SEASON } = require('../../constants/leagues');
const { logger } = require('../../utils/logger');
const { safeErrorMessage } = require('../../utils/teamNameUtils');

function buildStandingsEmbed(leagueName, leagueLogo, standings, season) {
  const lines = standings.slice(0, 20).map((team, idx) => {
    const pos     = team.rank || idx + 1;
    const name    = team.team?.name || 'Unknown';
    const played  = team.all?.played ?? 0;
    const won     = team.all?.win    ?? 0;
    const drawn   = team.all?.draw   ?? 0;
    const lost    = team.all?.lose   ?? 0;
    const gd      = team.goalsDiff   ?? 0;
    const pts     = team.points      ?? 0;

    const posStr  = String(pos).padStart(2, ' ');
    const zone    = pos <= 4 ? '🟢' : pos <= 6 ? '🔵' : pos >= standings.length - 2 ? '🔴' : '⚪';

    return `${zone} \`${posStr}.\` **${name}** — P${played} W${won} D${drawn} L${lost} GD${gd > 0 ? '+' : ''}${gd} · **${pts}pts**`;
  });

  const embed = EmbedFactory.result(
    `📊 **${leagueName}** — ${season}/${season + 1} Table`,
    lines.join('\n') + '\n\n🟢 Champions League  🔵 Europa/Conference  🔴 Relegation'
  );

  if (leagueLogo) embed.setThumbnail(leagueLogo);
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('standings')
    .setDescription('📊 View league standings / table — no ID needed')
    .addStringOption((opt) =>
      opt.setName('league').setDescription('📊 League name (e.g. Premier League, La Liga)').setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName('season').setDescription('📊 Season year (e.g. 2024)').setRequired(false)
    ),

  cooldown: 20,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);

      const leagueInput = interaction.options.getString('league') || 'Premier League';
      const season       = interaction.options.getInteger('season') || CURRENT_SEASON;

      try {
        let leagueId;
        const leagueKey = Object.keys(LEAGUES).find((k) =>
          LEAGUES[k].name.toLowerCase().includes(leagueInput.toLowerCase())
        );
        if (leagueKey) {
          leagueId = LEAGUES[leagueKey].id;
        } else if (!isNaN(leagueInput)) {
          leagueId = parseInt(leagueInput);
        } else {
          const results = await api.searchLeague(leagueInput);
          if (results?.length) leagueId = results[0].league?.id;
        }

        if (!leagueId) {
          return interaction.editReply({
            embeds: [EmbedFactory.error('League Not Found', `Could not find league: \`${leagueInput}\``)],
          });
        }

        const data = await api.getStandings(leagueId, season);
        if (!data?.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('No Data', 'No standings found for this league/season.')],
          });
        }

        const standings   = data[0]?.league?.standings?.[0] || [];
        const leagueName  = data[0]?.league?.name || leagueInput;
        const leagueLogo  = data[0]?.league?.logo || null;

        if (!standings.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('No Standings', 'Standings not yet available for this competition.')],
          });
        }

        const embed = buildStandingsEmbed(leagueName, leagueLogo, standings, season);

        // Quick-jump buttons to other top leagues
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`standings_jump:39:${season}`).setLabel('🏴󠁧󠁢󠁥󠁮󠁧󠁿 PL').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`standings_jump:140:${season}`).setLabel('🇪🇸 La Liga').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`standings_jump:78:${season}`).setLabel('🇩🇪 Bundesliga').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`standings_jump:135:${season}`).setLabel('🇮🇹 Serie A').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`standings_jump:61:${season}`).setLabel('🇫🇷 Ligue 1').setStyle(ButtonStyle.Secondary),
        );

        const msg = await interaction.editReply({ embeds: [embed], components: [row] });

        const collector = msg.createMessageComponentCollector({
          filter: (i) => i.customId.startsWith('standings_jump:') && i.user.id === interaction.user.id,
          time: 180_000,
        });

        collector.on('collect', async (i) => {
          await i.deferUpdate();
          const [, lid, szn] = i.customId.split(':');
          const jumpData = await api.getStandings(parseInt(lid), parseInt(szn)).catch(() => null);
          const jumpStandings = jumpData?.[0]?.league?.standings?.[0] || [];
          const jumpName = jumpData?.[0]?.league?.name || 'League';
          const jumpLogo = jumpData?.[0]?.league?.logo || null;

          if (!jumpStandings.length) {
            return i.followUp({ content: '⚠️ No standings available for this league.', ephemeral: true });
          }

          await i.editReply({
            embeds: [buildStandingsEmbed(jumpName, jumpLogo, jumpStandings, parseInt(szn))],
            components: [row],
          });
        });

      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Standings Unavailable', safeErrorMessage(err, 'Failed to fetch standings. Please try again later.'))],
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
