'use strict';

const { EmbedFactory } = require('../utils/embed');
const Guild = require('../models/Guild');
const { FootballApiManager } = require('../services/FootballApiManager');
const { DEFAULT_LEAGUES } = require('../constants/leagues');
const { logger } = require('../utils/logger');
const { resolvePostableChannel, sendSafely } = require('./channelDelivery');

const CORE_LEAGUE_IDS = new Set(DEFAULT_LEAGUES.map((l) => l.id));

/**
 * LiveScoreScheduler posts live match updates every minute with rich embeds.
 *
 * Two independent channel types are supported:
 *  - channels.live  → posts every state change (score, half-time, full-time)
 *  - channels.goals → posts ONLY goal-scored events, optionally pinging a role
 */
class LiveScoreScheduler {
  constructor(client) {
    this.client = client;
    this.previousStates = this.client.activeMatches; // Collection<matchId, state>
  }

  async run() {
    const api = new FootballApiManager(this.client.cache);

    const guilds = await Guild.find({
      $or: [
        { 'channels.live.enabled': true, 'channels.live.channelId': { $ne: null } },
        { 'channels.goals.enabled': true, 'channels.goals.channelId': { $ne: null } },
      ],
    }).lean();

    if (!guilds.length) return;

    let liveMatches;
    try {
      liveMatches = await api.getLiveMatches();
    } catch (err) {
      logger.error('[LiveScoreScheduler] Failed to fetch live matches:', err.message);
      return;
    }

    if (!liveMatches?.length) {
      this.previousStates.clear();
      return;
    }

    // Restrict to top-5 leagues + World Cup only
    liveMatches = liveMatches.filter((m) => CORE_LEAGUE_IDS.has(m.league?.id));
    if (!liveMatches.length) return;

    let liveSent = 0;
    let goalSent = 0;

    for (const match of liveMatches) {
      const matchId    = String(match.fixture?.id);
      const homeGoals  = match.goals?.home ?? 0;
      const awayGoals  = match.goals?.away ?? 0;
      const minute     = match.fixture?.status?.elapsed;
      const status     = match.fixture?.status?.short;
      const statusLong = match.fixture?.status?.long || status;

      const stateKey  = `${homeGoals}-${awayGoals}-${status}`;
      const prevState = this.previousStates.get(matchId);
      const changed   = prevState !== stateKey;

      const prevGoalTotal = prevState
        ? parseInt(prevState.split('-')[0]) + parseInt(prevState.split('-')[1])
        : 0;
      const isGoal = prevState && (homeGoals + awayGoals) > prevGoalTotal;

      if (!changed) continue;
      this.previousStates.set(matchId, stateKey);

      const homeName   = match.teams?.home?.name || 'Home';
      const awayName    = match.teams?.away?.name || 'Away';
      const homeLogo    = match.teams?.home?.logo;
      const awayLogo     = match.teams?.away?.logo;
      const leagueName  = match.league?.name || 'Unknown League';
      const leagueLogo  = match.league?.logo;
      const venue       = match.fixture?.venue?.name;

      // Build the rich match embed
      const buildEmbed = (isGoalAlert = false) => {
        const color = isGoalAlert ? '#FF6B35' : '#C0392B';
        const title = isGoalAlert ? '⚽  G O A L !' : '🔴  LIVE UPDATE';

        // Compact, high-impact scoreline as the description hero
        const scoreLine = `**${homeName}** \`${homeGoals}\` — \`${awayGoals}\` **${awayName}**`;
        const separator = '──────────────────────────────────';
        const minuteStr = minute ? `**${minute}'**` : `**${statusLong}**`;
        const contextLine = `🏆 **${leagueName}**${match.league?.country ? ` · ${match.league.country}` : ''}`;
        const statusLine  = `⏱️ ${minuteStr}  ·  🏟️ ${venue || 'Unknown venue'}`;

        const description = [scoreLine, separator, contextLine, statusLine].join('\n');

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
          .setColor(color)
          .setTitle(title)
          .setDescription(description)
          .setTimestamp()
          .setFooter({ text: '⚽ GoalX Live · Updates every 60s' });

        if (leagueLogo) embed.setThumbnail(leagueLogo);
        if (homeLogo) embed.setAuthor({ name: `${homeName} vs ${awayName}`, iconURL: homeLogo });

        return embed;
      };

      for (const guildConfig of guilds) {
        // ── General live-update channel ────────────────────────────────────
        if (guildConfig.channels?.live?.enabled && guildConfig.channels?.live?.channelId) {
          const channel = await resolvePostableChannel(
            this.client, guildConfig.channels.live.channelId, guildConfig.guildId, 'LiveScoreScheduler(live)'
          );
          if (channel) {
            const embed = buildEmbed(isGoal);
            const ok = await sendSafely(channel, { embeds: [embed] }, guildConfig.guildId, 'LiveScoreScheduler(live)');
            if (ok) liveSent++;
          }
        }

        // ── Dedicated goal-alert channel ─────────────────────────────────
        if (isGoal && guildConfig.channels?.goals?.enabled && guildConfig.channels?.goals?.channelId) {
          const channel = await resolvePostableChannel(
            this.client, guildConfig.channels.goals.channelId, guildConfig.guildId, 'LiveScoreScheduler(goals)'
          );
          if (channel) {
            const embed = buildEmbed(true);
            const pingRole = guildConfig.channels.goals.roleId ? `<@&${guildConfig.channels.goals.roleId}>` : undefined;
            const ok = await sendSafely(
              channel, { content: pingRole, embeds: [embed] }, guildConfig.guildId, 'LiveScoreScheduler(goals)'
            );
            if (ok) goalSent++;
          }
        }
      }
    }

    if (liveSent > 0 || goalSent > 0) {
      logger.info(`[LiveScoreScheduler] Sent ${liveSent} live update(s) and ${goalSent} goal alert(s) this cycle.`);
    }
  }
}

module.exports = { LiveScoreScheduler };
