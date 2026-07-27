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

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatKickoff(isoDate) {
  if (!isoDate) return '🕐 TBD';
  const d = new Date(isoDate);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `🕐 ${hh}:${mm}`;
}

function todayLabel() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'UTC',
  });
}

const STATUS_MAP = {
  FT: '🔴 FULL-TIME!', AET: '🔴 FULL-TIME (AET)!', PEN: '🔴 FULL-TIME (PEN)!',
  HT: '🟡 HALF-TIME', '1H': '🟢 1ST HALF', '2H': '🟢 2ND HALF',
  ET: '🟠 EXTRA TIME', P: '🔴 PENALTIES',
  NS: '🕐 NOT STARTED', PST: '📅 POSTPONED', CANC: '❌ CANCELLED',
};

/**
 * Builds the main fixtures embed for a league group.
 */
function buildFixturesEmbed(leagueName, leagueLogo, matches, dateStr) {
  const lines = matches.map((m) => {
    const home = m.teams?.home?.name || 'Home';
    const away = m.teams?.away?.name || 'Away';
    return `• **${home}** vs **${away}** ${formatKickoff(m.fixture?.date)}`;
  });

  const embed = EmbedFactory.fixture(
    `Today's matches in **${leagueName}**`,
    `*${dateStr} (UTC)*\n\n${lines.join('\n')}\n\n⚡ Tap a match button below for lineups, stats & AI insights!`
  );

  if (leagueLogo) embed.setThumbnail(leagueLogo);
  return embed;
}

/**
 * Builds a row of match buttons (up to 5 per row). Label = "Home vs Away".
 */
function buildMatchButtons(matches) {
  const rows = [];
  for (let i = 0; i < Math.min(matches.length, 15); i += 5) {
    const chunk = matches.slice(i, i + 5);
    const row = new ActionRowBuilder();
    for (const m of chunk) {
      const home = (m.teams?.home?.name || 'Home').slice(0, 10);
      const away = (m.teams?.away?.name || 'Away').slice(0, 10);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`fixture_detail:${m.fixture?.id}`)
          .setLabel(`⚽ ${home} vs. ${away}`)
          .setStyle(ButtonStyle.Secondary)
      );
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Builds the detailed match embed shown when a match button is tapped.
 */
function buildMatchDetailEmbed(fixture, events) {
  const home = fixture.teams?.home?.name || 'Home';
  const away = fixture.teams?.away?.name || 'Away';
  const hg   = fixture.goals?.home ?? 0;
  const ag   = fixture.goals?.away ?? 0;
  const status  = fixture.fixture?.status?.short;
  const elapsed = fixture.fixture?.status?.elapsed;
  const leagueName = fixture.league?.name  || '';
  const season     = fixture.league?.season || '';
  const round      = fixture.league?.round  || '';
  const date = fixture.fixture?.date
    ? new Date(fixture.fixture.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : '';

  const statusLabel = STATUS_MAP[status] || `⏱️ ${status}`;
  const liveMinute  = elapsed ? ` · ${elapsed}'` : '';
  const isLive      = ['1H', '2H', 'ET', 'HT', 'P'].includes(status);
  const isFinished  = ['FT', 'AET', 'PEN'].includes(status);

  const goals = (events || []).filter((e) => e.type === 'Goal' && e.detail !== 'Missed Penalty');
  const goalLines = goals.map((e) => {
    const side   = e.team?.name === home ? `(${home})` : `(${away})`;
    const assist = e.assist?.name ? ` *(${e.assist.name})*` : '';
    const type   = e.detail === 'Own Goal' ? ' ⚽ OG' : e.detail === 'Penalty' ? ' ⚽ P' : '';
    return `[ ${e.time?.elapsed}' ] **${e.player?.name}**${assist}${type} ${side}`;
  });

  const description =
    `## ${home}  **${hg} – ${ag}**  ${away}\n\n` +
    (goalLines.length ? `⚽ **Goals**\n${goalLines.join('\n')}` : '') +
    `\n\n*League: ${leagueName} · ${round}, Season: ${season} | ${date}*`;

  // Use whichever themed builder matches the match's current state
  const embed = isLive
    ? EmbedFactory.live(`${statusLabel}${liveMinute}`, description)
    : isFinished
      ? EmbedFactory.result(`${statusLabel}${liveMinute}`, description)
      : EmbedFactory.profile(`${statusLabel}${liveMinute}`, description);

  if (fixture.league?.logo) embed.setThumbnail(fixture.league.logo);
  return embed;
}

/**
 * Builds the action buttons under a match detail embed.
 */
function buildDetailButtons(fixtureId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`fd_fixture:${fixtureId}`).setLabel('⚽ Fixture').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`fd_lineups:${fixtureId}`).setLabel('📋 Lineups').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`fd_subs:${fixtureId}`).setLabel('🔄 Substitutions').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`fd_cards:${fixtureId}`).setLabel('🟨 Cards').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`fd_stats:${fixtureId}`).setLabel('📊 Statistics').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ── Command ───────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fixtures')
    .setDescription('📅 View today\'s upcoming fixtures — no ID needed')
    .addStringOption((opt) =>
      opt.setName('league').setDescription('📅 Filter by league (default: all top leagues)').setRequired(false)
    ),

  cooldown: 15,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const leagueFilter = interaction.options.getString('league');
      const today = new Date().toISOString().split('T')[0];
      const dateLabel = todayLabel();

      try {
        const allFixtures = await api.getFixturesByDate(today) || [];

        if (!allFixtures.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('No Fixtures Today', 'There are no scheduled matches today. Check back tomorrow!')],
          });
        }

        // Group by league
        const byLeague = {};
        for (const f of allFixtures) {
          const key = f.league?.name || 'Unknown';
          if (leagueFilter && !key.toLowerCase().includes(leagueFilter.toLowerCase())) continue;
          if (!byLeague[key]) byLeague[key] = { matches: [], logo: f.league?.logo };
          byLeague[key].matches.push(f);
        }

        const leagueKeys = Object.keys(byLeague);
        if (!leagueKeys.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('No Fixtures Found', `No fixtures found${leagueFilter ? ` for **${leagueFilter}**` : ''} today.`)],
          });
        }

        const firstKey = leagueKeys[0];
        const { matches: firstMatches, logo: firstLogo } = byLeague[firstKey];
        const embed = buildFixturesEmbed(firstKey, firstLogo, firstMatches, dateLabel);
        const rows  = buildMatchButtons(firstMatches);

        const msg = await interaction.editReply({ embeds: [embed], components: rows });

        if (leagueKeys.length > 1) {
          await interaction.followUp({
            content: `📅 Also found fixtures in: **${leagueKeys.slice(1, 5).join(', ')}**${leagueKeys.length > 5 ? ` and ${leagueKeys.length - 5} more` : ''}. Use \`/fixtures league:<name>\` to filter.`,
            ephemeral: true,
          });
        }

        // ── Match detail button collector ─────────────────
        const collector = msg.createMessageComponentCollector({
          filter: (i) => i.customId.startsWith('fixture_detail:'),
          time: 300_000,
        });

        collector.on('collect', async (i) => {
          await i.deferReply({ ephemeral: false });
          const fixtureId = parseInt(i.customId.split(':')[1]);

          try {
            const [fixtureData, eventsData] = await Promise.allSettled([
              api.getFixtureById(fixtureId),
              api.getFixtureEvents(fixtureId),
            ]);

            const fixture = fixtureData.value?.[0];
            if (!fixture) return i.editReply({ content: '❌ Match data not available.' });

            const detailEmbed   = buildMatchDetailEmbed(fixture, eventsData.value || []);
            const detailButtons = buildDetailButtons(fixtureId);
            const detailMsg     = await i.editReply({ embeds: [detailEmbed], components: detailButtons });

            // ── Sub-collector: Fixture/Lineups/Subs/Cards/Stats ──
            const subCollector = detailMsg.createMessageComponentCollector({
              filter: (si) =>
                ['fd_fixture', 'fd_lineups', 'fd_subs', 'fd_cards', 'fd_stats']
                  .some((p) => si.customId.startsWith(p)) && si.user.id === i.user.id,
              time: 120_000,
            });

            subCollector.on('collect', async (si) => {
              await si.deferUpdate();
              const [action, fid] = si.customId.split(':');
              const fIdNum = parseInt(fid);

              try {
                if (action === 'fd_fixture') {
                  const [fd, ev] = await Promise.allSettled([api.getFixtureById(fIdNum), api.getFixtureEvents(fIdNum)]);
                  const refreshed = fd.value?.[0];
                  if (refreshed) {
                    await si.editReply({
                      embeds: [buildMatchDetailEmbed(refreshed, ev.value || [])],
                      components: buildDetailButtons(fIdNum),
                    });
                  }
                }

                if (action === 'fd_lineups') {
                  const lineupData = await api.getFixtureLineups(fIdNum).catch(() => null);
                  if (!lineupData?.length) return si.followUp({ content: '📋 Lineups not yet announced.', ephemeral: true });

                  const lineupEmbed = EmbedFactory.compare('Match Lineups');
                  for (const side of lineupData) {
                    const name      = side.team?.name  || 'Team';
                    const formation = side.formation   || 'N/A';
                    const coach     = side.coach?.name || 'Unknown';
                    const starters  = (side.startXI     || []).map((p, idx) => `${idx + 1}. ${p.player?.name}`);
                    const bench     = (side.substitutes || []).map((p) => p.player?.name).join(', ');

                    EmbedFactory.addFields(lineupEmbed, [{
                      name:  `🔶 ${name} (${formation})`,
                      value: `👨‍💼 Coach: **${coach}**\n\n**Starting XI:**\n${starters.join('\n')}\n\n**Bench:** ${bench || 'N/A'}`,
                      inline: true,
                    }]);
                  }

                  await si.followUp({ embeds: [lineupEmbed] });
                }

                if (action === 'fd_subs') {
                  const evts = await api.getFixtureEvents(fIdNum).catch(() => null);
                  const subs = (evts || []).filter((e) => e.type === 'subst');
                  if (!subs.length) return si.followUp({ content: '🔄 No substitutions made yet.', ephemeral: true });

                  const subsEmbed = EmbedFactory.subs(
                    '🔄 Substitutions',
                    subs.map((s) => `${s.time?.elapsed}' **${s.player?.name}** ↕ ${s.assist?.name} (${s.team?.name})`).join('\n')
                  );
                  await si.followUp({ embeds: [subsEmbed] });
                }

                if (action === 'fd_cards') {
                  const evts  = await api.getFixtureEvents(fIdNum).catch(() => null);
                  const cards = (evts || []).filter((e) => e.type === 'Card');
                  if (!cards.length) return si.followUp({ content: '🟨 No cards shown yet.', ephemeral: true });

                  const cardsEmbed = EmbedFactory.stats(
                    '🟨 Cards',
                    cards.map((c) => `${c.detail === 'Red Card' ? '🟥' : '🟨'} ${c.time?.elapsed}' **${c.player?.name}** (${c.team?.name})`).join('\n')
                  );
                  await si.followUp({ embeds: [cardsEmbed] });
                }

                if (action === 'fd_stats') {
                  const statsData = await api.getFixtureStatistics(fIdNum).catch(() => null);
                  if (!statsData?.length) return si.followUp({ content: '📊 Statistics not yet available.', ephemeral: true });

                  const hs = statsData[0]?.statistics || [];
                  const as = statsData[1]?.statistics || [];
                  const get = (arr, type) => arr.find((s) => s.type === type)?.value ?? '—';

                  const fd2 = await api.getFixtureById(fIdNum).catch(() => null);
                  const hName = fd2?.[0]?.teams?.home?.name || 'Home';
                  const aName = fd2?.[0]?.teams?.away?.name || 'Away';

                  const rows = [
                    ['Ball Possession', 'Ball Possession'], ['Total Shots', 'Total Shots'],
                    ['Shots on Goal', 'Shots on Goal'], ['Fouls', 'Fouls'],
                    ['Yellow Cards', 'Yellow Cards'], ['Red Cards', 'Red Cards'],
                    ['Corner Kicks', 'Corner Kicks'], ['Offsides', 'Offsides'],
                    ['Goalkeeper Saves', 'Goalkeeper Saves'], ['Total passes', 'Total passes'],
                    ['Passes accurate', 'Passes accurate'],
                  ];

                  const statsEmbed = EmbedFactory.matchStat(
                    '📊 Match Statistics',
                    `**${hName}** vs **${aName}**\n\n${rows.map(([label, key]) => `**${label}:** ${get(hs, key)} — ${get(as, key)}`).join('\n')}`
                  );
                  await si.followUp({ embeds: [statsEmbed] });
                }
              } catch (err) {
                logger.error('[fixtures sub-button]', err.message);
                si.followUp({ content: '❌ Failed to load data.', ephemeral: true }).catch(() => {});
              }
            });
          } catch (err) {
            logger.error('[fixtures match button]', err.message);
            i.editReply({ content: '❌ Could not load match details.' }).catch(() => {});
          }
        });

      } catch (err) {
        logger.error('[fixtures command]', err.message);
        await interaction.editReply({
          embeds: [EmbedFactory.error('Error', err.message || 'Failed to fetch fixtures. Please try again.')],
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
