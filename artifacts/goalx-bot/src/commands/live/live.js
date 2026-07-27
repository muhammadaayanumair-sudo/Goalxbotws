'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { logger } = require('../../utils/logger');

const STATUS_MAP = {
  '1H': '🟢 1ST HALF', '2H': '🟢 2ND HALF', HT: '🟡 HALF-TIME',
  ET: '🟠 EXTRA TIME', P: '🔴 PENALTIES', FT: '🔴 FULL-TIME!',
};

/**
 * Builds the "all live matches" overview embed, grouped by league.
 */
function buildOverviewEmbed(matches, refreshed = false) {
  const byLeague = {};
  for (const m of matches) {
    const key = m.league?.name || 'Unknown';
    if (!byLeague[key]) byLeague[key] = [];
    byLeague[key].push(m);
  }

  const lines = [];
  for (const [league, ms] of Object.entries(byLeague)) {
    lines.push(`\n**🏆 ${league}**`);
    for (const m of ms) {
      const home   = m.teams?.home?.name || 'Home';
      const away   = m.teams?.away?.name || 'Away';
      const hg     = m.goals?.home ?? 0;
      const ag     = m.goals?.away ?? 0;
      const minute = m.fixture?.status?.elapsed ? `${m.fixture.status.elapsed}'` : m.fixture?.status?.short || '';
      const dot    = m.fixture?.status?.short === 'HT' ? '🟡' : '🔴';
      lines.push(`${dot} **${home}  ${hg} – ${ag}  ${away}** · ⏱️ ${minute}`);
    }
  }

  const suffix = refreshed ? ' · Refreshed' : ' in Progress';
  return EmbedFactory.live(
    `LIVE — ${matches.length} Match${matches.length !== 1 ? 'es' : ''}${suffix}`,
    lines.join('\n') + '\n\n⚡ Tap a match button for goals, cards & full stats!'
  );
}

/**
 * Builds the single-match detail embed shared by the initial button press
 * and the "Fixture" refresh sub-button — one source of truth, no duplication.
 */
function buildMatchDetailEmbed(fixture, events) {
  const home    = fixture.teams?.home?.name || 'Home';
  const away    = fixture.teams?.away?.name || 'Away';
  const hg      = fixture.goals?.home ?? 0;
  const ag      = fixture.goals?.away ?? 0;
  const elapsed = fixture.fixture?.status?.elapsed;
  const status  = fixture.fixture?.status?.short;
  const statusLabel = STATUS_MAP[status] || `⏱️ ${status}`;

  const goals = (events || []).filter((e) => e.type === 'Goal' && e.detail !== 'Missed Penalty');
  const goalLines = goals.map((e) => {
    const side   = e.team?.name === home ? `(${home})` : `(${away})`;
    const assist = e.assist?.name ? ` *(${e.assist.name})*` : '';
    const type   = e.detail === 'Own Goal' ? ' OG' : e.detail === 'Penalty' ? ' P' : '';
    return `[ ${e.time?.elapsed}' ] **${e.player?.name}**${assist}${type} ${side}`;
  });

  const embed = EmbedFactory.live(
    `${statusLabel}${elapsed ? ` · ${elapsed}'` : ''}`,
    `## ${home}  **${hg} – ${ag}**  ${away}\n\n` +
    (goalLines.length ? `⚽ **Goals**\n${goalLines.join('\n')}\n\n` : '') +
    `*${fixture.league?.name} · ${fixture.league?.round}*`
  );
  embed.setThumbnail(fixture.league?.logo || null);
  return embed;
}

function buildDetailButtons(fixtureId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ld_fixture:${fixtureId}`).setLabel('⚽ Fixture').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ld_lineups:${fixtureId}`).setLabel('📋 Lineups').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ld_subs:${fixtureId}`).setLabel('🔄 Substitutions').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ld_cards:${fixtureId}`).setLabel('🟨 Cards').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ld_stats:${fixtureId}`).setLabel('📊 Statistics').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('live')
    .setDescription('🔴 View all live matches right now — no ID needed')
    .addStringOption((opt) => opt.setName('league').setDescription('🔴 Filter by league name').setRequired(false)),

  cooldown: 20,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const leagueFilter = interaction.options.getString('league');

      try {
        const matches = await api.getLiveMatches() || [];
        const filtered = leagueFilter
          ? matches.filter((m) => m.league?.name?.toLowerCase().includes(leagueFilter.toLowerCase()))
          : matches;

        if (!filtered.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('No Live Matches', 'No matches are live right now. Check `/fixtures` for upcoming games.')],
          });
        }

        const embed = buildOverviewEmbed(filtered);

        // Build match buttons
        const rows = [];
        const allMatches = filtered.slice(0, 15);
        for (let i = 0; i < allMatches.length; i += 5) {
          const chunk = allMatches.slice(i, i + 5);
          const row = new ActionRowBuilder();
          for (const m of chunk) {
            const home = (m.teams?.home?.name || 'H').slice(0, 9);
            const away = (m.teams?.away?.name || 'A').slice(0, 9);
            const hg = m.goals?.home ?? 0;
            const ag = m.goals?.away ?? 0;
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`live_detail:${m.fixture?.id}`)
                .setLabel(`⚽ ${home} ${hg}-${ag} ${away}`)
                .setStyle(ButtonStyle.Danger)
            );
          }
          rows.push(row);
        }

        const refreshRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('live_refresh').setLabel('🔄 Refresh Scores').setStyle(ButtonStyle.Secondary)
        );
        if (rows.length < 5) rows.push(refreshRow);

        const msg = await interaction.editReply({ embeds: [embed], components: rows });

        const collector = msg.createMessageComponentCollector({
          filter: (i) =>
            (i.customId.startsWith('live_detail:') || i.customId === 'live_refresh') &&
            i.user.id === interaction.user.id,
          time: 300_000,
        });

        collector.on('collect', async (i) => {
          if (i.customId === 'live_refresh') {
            await i.deferUpdate();
            const fresh = await api.getLiveMatches().catch(() => []);
            const freshFiltered = leagueFilter
              ? fresh.filter((m) => m.league?.name?.toLowerCase().includes(leagueFilter.toLowerCase()))
              : fresh;

            if (!freshFiltered.length) {
              return i.editReply({
                embeds: [EmbedFactory.warning('No Live Matches', 'All matches have finished.')],
                components: [],
              });
            }

            await i.editReply({ embeds: [buildOverviewEmbed(freshFiltered, true)], components: rows });
            return;
          }

          // Match detail — first press
          await i.deferReply();
          const fixtureId = parseInt(i.customId.split(':')[1]);

          const [fixtureData, eventsData] = await Promise.allSettled([
            api.getFixtureById(fixtureId),
            api.getFixtureEvents(fixtureId),
          ]);

          const fixture = fixtureData.value?.[0];
          if (!fixture) return i.editReply({ content: '❌ Match data unavailable.' });

          const detailBtns = buildDetailButtons(fixtureId);
          const detailMsg  = await i.editReply({
            embeds: [buildMatchDetailEmbed(fixture, eventsData.value || [])],
            components: detailBtns,
          });

          const sub = detailMsg.createMessageComponentCollector({
            filter: (si) => ['ld_fixture', 'ld_lineups', 'ld_subs', 'ld_cards', 'ld_stats'].some((p) => si.customId.startsWith(p)) && si.user.id === i.user.id,
            time: 120_000,
          });

          sub.on('collect', async (si) => {
            await si.deferUpdate();
            const [action, fid] = si.customId.split(':');
            const fnum = parseInt(fid);

            if (action === 'ld_fixture') {
              const [fd, ev] = await Promise.allSettled([api.getFixtureById(fnum), api.getFixtureEvents(fnum)]);
              const refreshedFixture = fd.value?.[0];
              if (!refreshedFixture) return;
              await si.editReply({
                embeds: [buildMatchDetailEmbed(refreshedFixture, ev.value || [])],
                components: detailBtns,
              });
            }

            if (action === 'ld_lineups') {
              const ld = await api.getFixtureLineups(fnum).catch(() => null);
              if (!ld?.length) return si.followUp({ content: '📋 Lineups not yet announced.', ephemeral: true });

              const lineupEmbed = EmbedFactory.compare('Lineups');
              for (const s of ld) {
                const starters = (s.startXI || []).map((p, idx) => `${idx + 1}. ${p.player?.name}`);
                EmbedFactory.addFields(lineupEmbed, [{
                  name: `🔶 ${s.team?.name} (${s.formation})`,
                  value: `👨‍💼 ${s.coach?.name}\n\n${starters.join('\n')}`,
                  inline: true,
                }]);
              }
              await si.followUp({ embeds: [lineupEmbed] });
            }

            if (action === 'ld_subs') {
              const evts = await api.getFixtureEvents(fnum).catch(() => null);
              const subs = (evts || []).filter((e) => e.type === 'subst');
              if (!subs.length) return si.followUp({ content: '🔄 No subs yet.', ephemeral: true });

              const subsEmbed = EmbedFactory.subs(
                '🔄 Substitutions',
                subs.map((s) => `${s.time?.elapsed}' **${s.player?.name}** ↕ ${s.assist?.name} (${s.team?.name})`).join('\n')
              );
              await si.followUp({ embeds: [subsEmbed] });
            }

            if (action === 'ld_cards') {
              const evts  = await api.getFixtureEvents(fnum).catch(() => null);
              const cards = (evts || []).filter((e) => e.type === 'Card');
              if (!cards.length) return si.followUp({ content: '🟨 No cards yet.', ephemeral: true });

              const cardsEmbed = EmbedFactory.stats(
                '🟨 Cards',
                cards.map((c) => `${c.detail === 'Red Card' ? '🟥' : '🟨'} ${c.time?.elapsed}' **${c.player?.name}** (${c.team?.name})`).join('\n')
              );
              await si.followUp({ embeds: [cardsEmbed] });
            }

            if (action === 'ld_stats') {
              const sd = await api.getFixtureStatistics(fnum).catch(() => null);
              if (!sd?.length) return si.followUp({ content: '📊 Stats not available yet.', ephemeral: true });

              const hs2 = sd[0]?.statistics || [];
              const as2 = sd[1]?.statistics || [];
              const get = (arr, t) => arr.find((s) => s.type === t)?.value ?? '—';

              const statsEmbed = EmbedFactory.matchStat(
                '📊 Live Statistics',
                [
                  ['Ball Possession', 'Ball Possession'], ['Total Shots', 'Total Shots'],
                  ['Shots on Goal', 'Shots on Goal'], ['Fouls', 'Fouls'],
                  ['Yellow Cards', 'Yellow Cards'], ['Corner Kicks', 'Corner Kicks'],
                  ['Offsides', 'Offsides'],
                ].map(([l, k]) => `**${l}:** ${get(hs2, k)} — ${get(as2, k)}`).join('\n')
              );
              await si.followUp({ embeds: [statsEmbed] });
            }
          });
        });

      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Live Scores Unavailable', err.message || 'Failed to fetch live matches.')],
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
