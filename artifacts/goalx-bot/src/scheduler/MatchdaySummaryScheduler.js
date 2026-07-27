'use strict';

const Guild = require('../models/Guild');
const { FootballApiManager } = require('../services/FootballApiManager');
const { EmbedFactory } = require('../utils/embed');
const { DEFAULT_LEAGUES } = require('../constants/leagues');
const { logger } = require('../utils/logger');
const { resolvePostableChannel, sendSafely } = require('./channelDelivery');

const CORE_LEAGUE_IDS = new Set(DEFAULT_LEAGUES.map((l) => l.id));

/**
 * MatchdaySummaryScheduler — posts a daily fixture digest to guilds that have a
 * matchday channel enabled. Runs once per day at a configurable time.
 *
 * The summary shows every fixture for the configured day, grouped by league,
 * with kickoff times and venue info.
 */
class MatchdaySummaryScheduler {
  constructor(client) {
    this.client = client;
    this.api = new FootballApiManager(client.cache);
  }

  async run() {
    const guilds = await Guild.find({
      'channels.matchday.enabled': true,
      'channels.matchday.channelId': { $ne: null },
      'autoPost.matchdaySummary': true,
    }).lean();

    if (!guilds.length) return;

    const today = new Date().toISOString().split('T')[0];
    let fixtures;
    try {
      fixtures = await this.api.getFixturesByDate(today) || [];
    } catch (err) {
      logger.error('[MatchdaySummaryScheduler] Failed to fetch fixtures:', err.message);
      return;
    }

    // Restrict to top-5 leagues + World Cup only
    fixtures = fixtures.filter((f) => CORE_LEAGUE_IDS.has(f.league?.id));

    if (!fixtures.length) {
      logger.info('[MatchdaySummaryScheduler] No fixtures today in core leagues — nothing to summarize.');
      return;
    }

    // Group by league and sort by kickoff time.
    const byLeague = {};
    for (const f of fixtures) {
      const leagueName = f.league?.name || 'Unknown League';
      if (!byLeague[leagueName]) {
        byLeague[leagueName] = { matches: [], logo: f.league?.logo, country: f.league?.country };
      }
      byLeague[leagueName].matches.push(f);
    }

    for (const league of Object.values(byLeague)) {
      league.matches.sort((a, b) => new Date(a.fixture?.date || 0) - new Date(b.fixture?.date || 0));
    }

    const dateLabel = new Date(today).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    let postedCount = 0;

    for (const guild of guilds) {
      const channel = await resolvePostableChannel(
        this.client, guild.channels.matchday.channelId, guild.guildId, 'MatchdaySummaryScheduler'
      );
      if (!channel) continue;

      // Filter to followed leagues/teams if configured.
      let relevantLeagues = Object.entries(byLeague);
      if (guild.autoPost?.followedOnly) {
        const followedLeagues = new Set(guild.followedLeagues || []);
        const followedTeams = new Set(guild.followedTeams || []);
        relevantLeagues = relevantLeagues.filter(([name, data]) => {
          const leagueId = String(data.matches[0]?.league?.id || '');
          if (followedLeagues.has(leagueId)) return true;
          return data.matches.some((m) => {
            const homeId = String(m.teams?.home?.id || '');
            const awayId = String(m.teams?.away?.id || '');
            return followedTeams.has(homeId) || followedTeams.has(awayId);
          });
        });
      }

      if (!relevantLeagues.length) continue;

      // One embed per league to keep descriptions readable.
      for (const [leagueName, data] of relevantLeagues.slice(0, 10)) {
        const lines = data.matches.slice(0, 10).map((m) => {
          const home = m.teams?.home?.name || 'Home';
          const away = m.teams?.away?.name || 'Away';
          const time = m.fixture?.date
            ? `<t:${Math.floor(new Date(m.fixture.date).getTime() / 1000)}:t>`
            : '`TBD`';
          const venue = m.fixture?.venue?.name ? `  ·  🏟️ ${m.fixture.venue.name}` : '';
          return `\`${home}\` **vs** \`${away}\`  ·  ${time}${venue}`;
        });

        const overflow = data.matches.length > 10 ? `\n*+${data.matches.length - 10} more matches*` : '';
        const description = `📆 **${dateLabel}**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}${overflow}`;

        const embed = EmbedFactory.matchday(leagueName, description)
          .setThumbnail(data.logo)
          .setFooter({ text: `${data.matches.length} match${data.matches.length !== 1 ? 'es' : ''} · Matchday Summary` });

        const ok = await sendSafely(channel, { embeds: [embed] }, guild.guildId, 'MatchdaySummaryScheduler');
        if (ok) postedCount++;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    logger.info(`[MatchdaySummaryScheduler] Posted ${postedCount} summary embed(s) across ${guilds.length} guild(s).`);
  }
}

module.exports = { MatchdaySummaryScheduler };
