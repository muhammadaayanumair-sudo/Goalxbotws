'use strict';

const { EmbedFactory } = require('../utils/embed');
const Guild = require('../models/Guild');
const { FootballApiManager } = require('../services/FootballApiManager');
const { DEFAULT_LEAGUES } = require('../constants/leagues');
const { logger } = require('../utils/logger');
const { resolvePostableChannel, sendSafely } = require('./channelDelivery');

/**
 * FixtureScheduler — posts today's fixtures with rich, structured embeds
 * to all configured guild channels every 6 hours.
 */
class FixtureScheduler {
  constructor(client) {
    this.client = client;
  }

  async run() {
    const guilds = await Guild.find({
      'channels.fixtures.enabled': true,
      'channels.fixtures.channelId': { $ne: null },
    }).lean();

    if (!guilds.length) return;

    const api   = new FootballApiManager(this.client.cache);
    const today = new Date().toISOString().split('T')[0];

    let allFixtures = [];
    try {
      allFixtures = await api.getFixturesByDate(today) || [];
    } catch (err) {
      logger.error('[FixtureScheduler] Failed to fetch fixtures:', err.message);
      return;
    }

    const topLeagueIds = DEFAULT_LEAGUES.map((l) => l.id);
    const filtered     = allFixtures.filter((f) => topLeagueIds.includes(f.league?.id));
    if (!filtered.length) return;

    // Group by league
    const byLeague = {};
    for (const f of filtered) {
      const key = f.league?.name || 'Unknown';
      if (!byLeague[key]) byLeague[key] = { matches: [], logo: f.league?.logo, country: f.league?.country };
      byLeague[key].matches.push(f);
    }

    let postedCount = 0;

    for (const guildConfig of guilds) {
      const channel = await resolvePostableChannel(
        this.client, guildConfig.channels.fixtures.channelId, guildConfig.guildId, 'FixtureScheduler'
      );
      if (!channel) continue;

      for (const [leagueName, data] of Object.entries(byLeague)) {
        const embed = this._buildLeagueEmbed(leagueName, data, today);
        const ok = await sendSafely(channel, { embeds: [embed] }, guildConfig.guildId, 'FixtureScheduler');
        if (ok) postedCount++;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    logger.info(`[FixtureScheduler] Posted ${postedCount} fixture message(s) across ${guilds.length} guild(s).`);
  }

  _buildLeagueEmbed(leagueName, data, today) {
    const matches = data.matches.slice(0, 10);

    const matchLines = matches.map((m) => {
      const home = m.teams?.home?.name || 'Home';
      const away = m.teams?.away?.name || 'Away';
      const time = m.fixture?.date
        ? `<t:${Math.floor(new Date(m.fixture.date).getTime() / 1000)}:t>`
        : '`TBD`';
      const venue = m.fixture?.venue?.name;
      const venuePart = venue ? `  ·  🏟️ *${venue}*` : '';
      return `\`${home}\` **vs** \`${away}\`  ·  ${time}${venuePart}`;
    });

    const countTotal = data.matches.length;
    const overflowNote = countTotal > 10
      ? `\n*+${countTotal - 10} more matches not shown*`
      : '';

    const dateLabel = new Date(today).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    const countryFlag = data.country ? ` · ${data.country}` : '';
    const description =
      `📆 **${dateLabel}**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      matchLines.join('\n') +
      overflowNote;

    const count = data.matches.length;
    const embed = EmbedFactory.fixture(`${leagueName}${countryFlag}`)
      .setDescription(description)
      .setFooter({ text: `${count} match${count !== 1 ? 'es' : ''} today · ⚽ GoalX` });

    if (data.logo) embed.setThumbnail(data.logo);

    return embed;
  }
}

module.exports = { FixtureScheduler };
