'use strict';

const { EmbedBuilder } = require('discord.js');
const Guild = require('../models/Guild');
const MatchTracker = require('../models/MatchTracker');
const { FootballApiManager } = require('../services/FootballApiManager');
const { EmbedFactory } = require('../utils/embed');
const { DEFAULT_LEAGUES } = require('../constants/leagues');
const { logger } = require('../utils/logger');
const { resolvePostableChannel, sendSafely } = require('./channelDelivery');

const CORE_LEAGUE_IDS = new Set(DEFAULT_LEAGUES.map((l) => l.id));

const LIVE_STATUS = new Set(['1H', '2H', 'ET', 'P', 'LIVE', 'IN_PLAY', 'PAUSED']);
const FINISHED_STATUS = new Set(['FT', 'AET', 'PEN']);

/**
 * Checks whether an event type is enabled for a guild.
 * Works with both Mongoose documents and .lean() plain objects, and handles
 * channel-level overrides stored as either a JS Map or a plain object.
 */
function isEventEnabled(guild, eventName, channelType = null) {
  const channel = channelType && guild.channels?.[channelType];
  if (channel && typeof channel.events === 'object') {
    const events = channel.events;
    if (events instanceof Map && events.has(eventName)) return events.get(eventName);
    if (events && eventName in events) return events[eventName];
  }
  return guild.autoPost?.[eventName] ?? false;
}

/**
 * MatchdayEngine — event-driven match lifecycle autoposter.
 *
 * Replaces the old LiveScoreScheduler. Instead of posting every minute's score,
 * it detects discrete events (kickoff, lineups, goals, red cards, halftime,
 * full-time, penalties) and posts them once per event per guild.
 *
 * State is persisted in MongoDB (MatchTracker) so restarts do not duplicate posts.
 */
class MatchdayEngine {
  constructor(client) {
    this.client = client;
    this.api = new FootballApiManager(client.cache);
    // Event fetches are expensive — limit concurrency.
    this.detailLimiter = { running: 0, max: 2 };
  }

  async run() {
    const guilds = await this._getActiveGuilds();
    if (!guilds.length) return;

    let liveMatches;
    try {
      liveMatches = await this.api.getLiveMatches();
    } catch (err) {
      logger.error('[MatchdayEngine] Failed to fetch live matches:', err.message);
      return;
    }

    if (!liveMatches?.length) {
      // No matches live — mark any previously live matches as finished if they
      // disappeared from the feed before we saw FT.
      await this._resolveVanishedMatches();
      return;
    }

    // Restrict to top-5 leagues + World Cup only
    liveMatches = liveMatches.filter((m) => CORE_LEAGUE_IDS.has(m.league?.id));

    let totalEvents = 0;

    for (const match of liveMatches) {
      const events = await this._processMatch(match, guilds);
      totalEvents += events.length;
    }

    if (totalEvents > 0) {
      logger.info(`[MatchdayEngine] Processed ${totalEvents} event(s) across ${liveMatches.length} live match(es).`);
    }
  }

  // ─── Guild loading & filtering ───────────────────────────────────────────────

  async _getActiveGuilds() {
    const channelTypes = ['live', 'goals', 'matchday', 'lineups', 'results'];
    const orConditions = channelTypes.map((type) => ({
      [`channels.${type}.enabled`]: true,
      [`channels.${type}.channelId`]: { $ne: null },
    }));
    return Guild.find({ $or: orConditions }).lean();
  }

  // ─── Match processing ──────────────────────────────────────────────────────────

  async _processMatch(match, guilds) {
    const fixtureId = String(match.fixture?.id);
    if (!fixtureId) return [];

    const tracker = await MatchTracker.findOneAndUpdate(
      { fixtureId },
      { $setOnInsert: this._buildNewTrackerFields(match) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const status = match.fixture?.status?.short || 'NS';
    const elapsed = match.fixture?.status?.elapsed ?? tracker.elapsed ?? null;
    const homeScore = match.goals?.home ?? 0;
    const awayScore = match.goals?.away ?? 0;

    // Signatures:
    //  - changeSignature: status + score (no elapsed). Used to decide whether
    //    a meaningful state change happened and to emit live updates.
    //  - stateSignature: status + elapsed + score. Stored for diagnostics.
    const changeSignature = `${status}:${homeScore}:${awayScore}`;
    const stateSignature = `${status}:${elapsed}:${homeScore}:${awayScore}`;
    const changed = tracker.changeSignature !== changeSignature;

    const newEvents = [];

    // 1. Kickoff / lineups — only when a fixture transitions from Not Started to live.
    if (tracker.status === 'NS' && this._isLiveStatus(status)) {
      const lineupData = await this._fetchLineupsWithBackoff(fixtureId);
      newEvents.push(this._buildKickoffEvent(match, lineupData, elapsed));
    }

    // 2. Score change — goal events (including penalties/own goals).
    if (homeScore !== tracker.homeScore || awayScore !== tracker.awayScore) {
      const events = await this._fetchEventsWithBackoff(fixtureId);
      const goalEvents = this._detectGoalEvents(tracker, match, events, elapsed);
      newEvents.push(...goalEvents);
    }

    // 3. Red cards / second yellows / substitutions.
    // We fetch events every tick for live matches so we don't miss cards/subs that
    // happen without a score change. The API-Football /fixtures/events endpoint is
    // cached for 60s, so this is bounded. With fallback providers it simply returns
    // empty and we skip silently.
    const events = await this._fetchEventsWithBackoff(fixtureId);
    const cardEvents = this._detectCardEvents(tracker, events, elapsed);
    newEvents.push(...cardEvents);
    const subEvents = this._detectSubstitutionEvents(tracker, events, elapsed);
    newEvents.push(...subEvents);

    // 4. Halftime / full-time / penalty status transitions.
    if (tracker.status !== 'HT' && status === 'HT') {
      newEvents.push(this._buildHalftimeEvent(match, elapsed));
    }
    if (!FINISHED_STATUS.has(tracker.status) && this._isFinished(status)) {
      newEvents.push(this._buildFulltimeEvent(match, status));
    }
    if (tracker.status !== 'P' && status === 'P') {
      newEvents.push(this._buildPenaltyEvent(match, elapsed));
    }

    // 5. Live ticker update — posted to the live channel whenever score/status changes
    // for an already-live match. This preserves the behaviour of the old LiveScoreScheduler.
    if (changed && tracker.status !== 'NS') {
      newEvents.push(this._buildLiveUpdateEvent(match, elapsed, homeScore, awayScore));
    }

    // 6. Persist updates and delivery metadata.
    tracker.status = status;
    tracker.elapsed = elapsed;
    tracker.homeScore = homeScore;
    tracker.awayScore = awayScore;
    tracker.stateSignature = stateSignature;
    tracker.changeSignature = changeSignature;
    tracker.lastUpdatedAt = new Date();
    if (this._isFinished(status)) tracker.finishedAt = new Date();
    tracker.events.push(...newEvents);
    await tracker.save();

    // 6. Deliver to configured guilds.
    if (newEvents.length) {
      await this._deliverEvents(tracker, newEvents, guilds);
    }

    return newEvents;
  }

  // ─── State & event helpers ───────────────────────────────────────────────────

  _isLiveStatus(status) {
    return LIVE_STATUS.has(status);
  }

  _isFinished(status) {
    return FINISHED_STATUS.has(status) || status === 'FT' || status === 'AET' || status === 'PEN';
  }

  _buildNewTrackerFields(match) {
    const f = match.fixture || {};
    const l = match.league || {};
    const t = match.teams || {};
    const h = t.home || {};
    const a = t.away || {};
    return {
      fixtureId: String(f.id),
      leagueId: String(l.id || ''),
      leagueName: l.name || 'Unknown League',
      leagueLogo: l.logo || null,
      country: l.country || null,
      homeId: String(h.id || ''),
      homeName: h.name || 'Home',
      homeLogo: h.logo || null,
      homeScore: 0,
      awayId: String(a.id || ''),
      awayName: a.name || 'Away',
      awayLogo: a.logo || null,
      awayScore: 0,
      status: f.status?.short || 'NS',
      elapsed: f.status?.elapsed ?? null,
      venue: f.venue?.name || null,
      date: f.date ? new Date(f.date) : null,
      stateSignature: '',
      changeSignature: '',
    };
  }

  async _resolveVanishedMatches() {
    // Mark any matches that were live in the last 24h but not finished as FT
    // so we stop tracking them. This handles API gaps.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await MatchTracker.updateMany(
      { status: { $in: Array.from(LIVE_STATUS) }, lastUpdatedAt: { $lt: cutoff } },
      { status: 'FT', finishedAt: new Date() }
    );
  }

  // ─── Detail fetching (with lightweight concurrency guard) ───────────────────────

  async _fetchLineupsWithBackoff(fixtureId) {
    try {
      return await this.api.getFixtureLineups(fixtureId);
    } catch (err) {
      logger.debug(`[MatchdayEngine] No lineups for ${fixtureId}: ${err.message}`);
      return null;
    }
  }

  async _fetchEventsWithBackoff(fixtureId) {
    try {
      return await this.api.getFixtureEvents(fixtureId);
    } catch (err) {
      logger.debug(`[MatchdayEngine] No events for ${fixtureId}: ${err.message}`);
      return [];
    }
  }

  // ─── Event builders ───────────────────────────────────────────────────────────

  _buildKickoffEvent(match, lineups, elapsed) {
    const home = match.teams?.home?.name || 'Home';
    const away = match.teams?.away?.name || 'Away';
    const minute = elapsed ? `${elapsed}'` : 'KICKOFF';
    return {
      type: 'KICKOFF',
      minute,
      team: null,
      player: null,
      assist: null,
      detail: lineups ? 'Lineups attached' : null,
      homeGoals: match.goals?.home ?? 0,
      awayGoals: match.goals?.away ?? 0,
      posted: false,
      _lineups: lineups,
      _match: match,
    };
  }

  _detectGoalEvents(tracker, match, events, elapsed) {
    const out = [];
    const previousGoalCount = tracker.homeScore + tracker.awayScore;
    const currentGoalCount = (match.goals?.home ?? 0) + (match.goals?.away ?? 0);
    if (currentGoalCount <= previousGoalCount) return out;

    // Goal events are typically type "Goal" with detail "Normal Goal", "Penalty", "Own Goal".
    const goalEvents = (events || []).filter((e) => e.type === 'Goal');
    const newGoals = goalEvents.slice(-(currentGoalCount - previousGoalCount));

    for (const e of newGoals) {
      const detail = e.detail || 'Goal';
      const type = detail === 'Own Goal' ? 'OWN_GOAL' : detail === 'Penalty' ? 'PENALTY' : 'GOAL';
      const teamName = e.team?.name || 'Team';
      const playerName = e.player?.name || 'Unknown';
      const assistName = e.assist?.name || null;

      out.push({
        type,
        minute: e.time?.elapsed ? `${e.time.elapsed}'` : `${elapsed || '?'}`,
        team: teamName,
        player: playerName,
        assist: assistName,
        detail,
        homeGoals: match.goals?.home ?? 0,
        awayGoals: match.goals?.away ?? 0,
        posted: false,
        _match: match,
      });
    }

    // Fallback if events endpoint is empty but score changed.
    if (!out.length) {
      out.push({
        type: 'GOAL',
        minute: elapsed ? `${elapsed}'` : '?',
        team: null,
        player: 'Goal scorer unavailable',
        assist: null,
        detail: 'Goal',
        homeGoals: match.goals?.home ?? 0,
        awayGoals: match.goals?.away ?? 0,
        posted: false,
        _match: match,
      });
    }
    return out;
  }

  _detectCardEvents(tracker, events, elapsed) {
    const seenKeys = new Set((tracker.events || []).map((e) => `${e.type}:${e.minute}:${e.player}`));
    const out = [];
    for (const e of events || []) {
      if (e.type !== 'Card') continue;
      const detail = e.detail || 'Yellow Card';
      const type = detail === 'Red Card' || detail === 'Second Yellow card' ? 'RED_CARD' : 'YELLOW_CARD';
      const minute = e.time?.elapsed ? `${e.time.elapsed}'` : `${elapsed || '?'}`;
      const key = `${type}:${minute}:${e.player?.name}`;
      if (seenKeys.has(key)) continue;

      out.push({
        type,
        minute: e.time?.elapsed ? `${e.time.elapsed}'` : `${elapsed || '?'}`,
        team: e.team?.name || null,
        player: e.player?.name || 'Unknown',
        assist: null,
        detail,
        homeGoals: tracker.homeScore,
        awayGoals: tracker.awayScore,
        posted: false,
        _match: tracker,
      });
    }
    return out;
  }

  _detectSubstitutionEvents(tracker, events, elapsed) {
    if (!tracker.events) tracker.events = [];
    const seenKeys = new Set(tracker.events.map((e) => `${e.type}:${e.minute}:${e.player}`));
    const out = [];
    for (const e of events || []) {
      if (e.type !== 'subst') continue;
      const minute = e.time?.elapsed ? `${e.time.elapsed}'` : `${elapsed || '?'}`;
      const key = `SUBSTITUTION:${minute}:${e.player?.name}`;
      if (seenKeys.has(key)) continue;

      out.push({
        type: 'SUBSTITUTION',
        minute,
        team: e.team?.name || null,
        player: e.player?.name || 'Off',
        assist: e.assist?.name || 'On',
        detail: 'Substitution',
        homeGoals: tracker.homeScore,
        awayGoals: tracker.awayScore,
        posted: false,
        _match: tracker,
      });
    }
    return out;
  }

  _buildHalftimeEvent(match, elapsed) {
    return {
      type: 'HALFTIME',
      minute: elapsed ? `${elapsed}'` : 'HT',
      team: null,
      player: null,
      assist: null,
      detail: 'Halftime',
      homeGoals: match.goals?.home ?? 0,
      awayGoals: match.goals?.away ?? 0,
      posted: false,
      _match: match,
    };
  }

  _buildFulltimeEvent(match, status) {
    return {
      type: 'FULLTIME',
      minute: 'FT',
      team: null,
      player: null,
      assist: null,
      detail: status === 'AET' ? 'After Extra Time' : status === 'PEN' ? 'After Penalties' : 'Full Time',
      homeGoals: match.goals?.home ?? 0,
      awayGoals: match.goals?.away ?? 0,
      posted: false,
      _match: match,
    };
  }

  _buildPenaltyEvent(match, elapsed) {
    return {
      type: 'PENALTY_SHOOTOUT',
      minute: elapsed ? `${elapsed}'` : 'PEN',
      team: null,
      player: null,
      assist: null,
      detail: 'Penalty shootout started',
      homeGoals: match.goals?.home ?? 0,
      awayGoals: match.goals?.away ?? 0,
      posted: false,
      _match: match,
    };
  }

  _buildLiveUpdateEvent(match, elapsed, homeScore, awayScore) {
    return {
      type: 'LIVE_UPDATE',
      minute: elapsed ? `${elapsed}'` : '',
      team: null,
      player: null,
      assist: null,
      detail: 'Live score update',
      homeGoals: homeScore,
      awayGoals: awayScore,
      posted: false,
      _match: match,
    };
  }

  // ─── Delivery ─────────────────────────────────────────────────────────────────

  async _deliverEvents(tracker, events, guilds) {
    const eventTypeMap = {
      KICKOFF: 'lineups',
      GOAL: 'goals',
      OWN_GOAL: 'goals',
      PENALTY: 'goals',
      RED_CARD: 'matchday',
      YELLOW_CARD: 'matchday',
      SUBSTITUTION: 'matchday',
      HALFTIME: 'matchday',
      FULLTIME: 'results',
      PENALTY_SHOOTOUT: 'matchday',
      LIVE_UPDATE: 'live',
    };

    for (const guild of guilds) {
      if (!this._guildShouldReceive(tracker, guild)) continue;

      for (const event of events) {
        const defaultChannel = eventTypeMap[event.type] || 'matchday';
        const eventKey = `${event.type}:${event.minute}:${event.player}`;

        if (tracker.hasDeliveredTo(guild.guildId, eventKey)) continue;

        // Determine which channel(s) to post to. Some events map to multiple
        // channel types (e.g., goals also go to live ticker channel if enabled).
        const targetTypes = this._resolveTargetChannelTypes(event, guild);
        if (!targetTypes.length) continue;

        const embed = this._buildEventEmbed(tracker, event);
        const payload = { embeds: [embed] };
        const rolePing = this._resolveRolePing(guild, event, targetTypes);
        if (rolePing) payload.content = rolePing;


        const seenChannelIds = new Set();
        let delivered = false;
        for (const type of targetTypes) {
          const channelId = guild.channels[type]?.channelId;
          if (!channelId || seenChannelIds.has(channelId)) continue;
          seenChannelIds.add(channelId);

          const channel = await resolvePostableChannel(
            this.client, channelId, guild.guildId, `MatchdayEngine(${type})`
          );
          if (!channel) continue;
          const ok = await sendSafely(channel, payload, guild.guildId, `MatchdayEngine(${type})`);
          if (ok) delivered = true;
        }

        if (delivered) {
          tracker.markDeliveredTo(guild.guildId, eventKey);
        }
      }
    }

    await tracker.save();
  }

  _guildShouldReceive(tracker, guild) {
    // Guild must have at least one relevant channel enabled.
    const relevantTypes = ['live', 'goals', 'matchday', 'lineups', 'results'];
    const hasChannel = relevantTypes.some((t) => guild.channels?.[t]?.enabled && guild.channels?.[t]?.channelId);
    if (!hasChannel) return false;

    // Followed-only filter.
    if (guild.autoPost?.followedOnly) {
      const followedLeagues = guild.followedLeagues || [];
      const followedTeams = guild.followedTeams || [];
      const matchLeagueId = String(tracker.leagueId || '');
      const homeId = String(tracker.homeId || '');
      const awayId = String(tracker.awayId || '');
      const leagueMatch = followedLeagues.includes(matchLeagueId);
      const teamMatch = followedTeams.includes(homeId) || followedTeams.includes(awayId);
      if (!leagueMatch && !teamMatch) return false;
    }

    return true;
  }

  _resolveTargetChannelTypes(event, guild) {
    const types = [];

    // Live ticker updates always go to the live channel (if enabled). This preserves
    // the old LiveScoreScheduler behaviour of posting a score/status update every minute.
    if (event.type === 'LIVE_UPDATE' && guild.channels?.live?.enabled && guild.channels?.live?.channelId) {
      return ['live'];
    }

    // Maps an event type to the channel(s) it should be posted in.
    const channelMap = {
      KICKOFF: ['lineups', 'matchday'],
      GOAL: ['goals', 'matchday'],
      OWN_GOAL: ['goals', 'matchday'],
      PENALTY: ['goals', 'matchday'],
      RED_CARD: ['matchday'],
      YELLOW_CARD: ['matchday'],
      SUBSTITUTION: ['matchday'],
      HALFTIME: ['matchday'],
      FULLTIME: ['results', 'matchday'],
      PENALTY_SHOOTOUT: ['matchday'],
    };

    // Maps an event type to the corresponding autoPost toggle key.
    const settingMap = {
      KICKOFF: 'lineups',
      GOAL: 'goals',
      OWN_GOAL: 'goals',
      PENALTY: 'goals',
      RED_CARD: 'redCards',
      YELLOW_CARD: 'yellowCards',
      SUBSTITUTION: 'substitutions',
      HALFTIME: 'halftime',
      FULLTIME: 'fulltime',
      PENALTY_SHOOTOUT: 'penalties',
    };

    const candidates = channelMap[event.type] || ['matchday'];
    const settingKey = settingMap[event.type] || event.type.toLowerCase();
    for (const type of candidates) {
      if (!guild.channels?.[type]?.enabled || !guild.channels?.[type]?.channelId) continue;
      if (isEventEnabled(guild, settingKey, type)) {
        types.push(type);
      }
    }

    // liveTicker = mirror discrete events to the live channel as well.
    if (guild.autoPost?.liveTicker && guild.channels?.live?.enabled && guild.channels?.live?.channelId) {
      if (!types.includes('live')) types.push('live');
    }

    return types;
  }

  _resolveRolePing(guild, event, targetTypes) {
    // Only ping for goals in the goals channel, or major transitions in matchday.
    if (event.type === 'GOAL' || event.type === 'PENALTY' || event.type === 'OWN_GOAL') {
      if (targetTypes.includes('goals') && guild.channels?.goals?.roleId) {
        return `<@&${guild.channels.goals.roleId}>`;
      }
    }
    if (event.type === 'KICKOFF' && targetTypes.includes('lineups') && guild.channels?.lineups?.roleId) {
      return `<@&${guild.channels.lineups.roleId}>`;
    }
    if ((event.type === 'FULLTIME' || event.type === 'PENALTY_SHOOTOUT') && targetTypes.includes('matchday') && guild.channels?.matchday?.roleId) {
      return `<@&${guild.channels.matchday.roleId}>`;
    }
    return null;
  }

  // ─── Embed builders ───────────────────────────────────────────────────────────

  _buildEventEmbed(tracker, event) {
    const match = event._match;
    const home = tracker.homeName || match?.teams?.home?.name || 'Home';
    const away = tracker.awayName || match?.teams?.away?.name || 'Away';
    const homeLogo = tracker.homeLogo || match?.teams?.home?.logo || null;
    const awayLogo = tracker.awayLogo || match?.teams?.away?.logo || null;
    const league = tracker.leagueName || match?.league?.name || 'Unknown League';
    const leagueLogo = tracker.leagueLogo || match?.league?.logo || null;
    const score = `\`${tracker.homeScore}\` **${home}**  —  \`${tracker.awayScore}\` **${away}**`;
    const minute = event.minute || '';

    switch (event.type) {
      case 'KICKOFF': {
        const lineupText = this._formatLineups(event._lineups);
        const desc = `⚽ **${home} vs ${away}** is underway!\n🏆 ${league}\n⏱️ ${minute}\n\n${lineupText}`;
        return EmbedFactory.kickoff(`${home} vs ${away} — KICKOFF`, desc)
          .setThumbnail(leagueLogo)
          .setAuthor({ name: home, iconURL: homeLogo })
          .setFooter({ text: `${home} vs ${away} · ${league} · Kickoff` });
      }

      case 'GOAL':
      case 'PENALTY':
      case 'OWN_GOAL': {
        const title = `${event.team || 'Goal'} — ${event.player}`;
        const assist = event.assist ? `\n👟 Assist: ${event.assist}` : '';
        const detail = event.detail && event.detail !== 'Goal' ? ` · ${event.detail}` : '';
        const icon = event.type === 'PENALTY' ? '🎯' : event.type === 'OWN_GOAL' ? '😬' : '⚽';
        const desc = `${icon} ${score}\n⏱️ ${minute}${detail}${assist}`;
        return EmbedFactory.goal(title, desc)
          .setThumbnail(event.team === away ? awayLogo : homeLogo)
          .setAuthor({ name: `${home} ${tracker.homeScore}–${tracker.awayScore} ${away}`, iconURL: homeLogo })
          .setFooter({ text: `${league} · Goal` });
      }

      case 'RED_CARD': {
        const title = `${event.player}`;
        const desc = `${score}\n⏱️ ${minute} · ${event.team || 'Unknown'}${event.detail ? ` · ${event.detail}` : ''}`;
        return EmbedFactory.redcard(title, desc)
          .setAuthor({ name: `${home} vs ${away}`, iconURL: homeLogo })
          .setFooter({ text: `${league} · Red Card` });
      }

      case 'YELLOW_CARD': {
        const title = `🟨 Yellow Card — ${event.player}`;
        const desc = `${score}\n⏱️ ${minute} · ${event.team || 'Unknown'}${event.detail ? ` · ${event.detail}` : ''}`;
        return EmbedFactory.event(title, desc)
          .setAuthor({ name: `${home} vs ${away}`, iconURL: homeLogo })
          .setFooter({ text: `${league} · Yellow Card` });
      }

      case 'SUBSTITUTION': {
        const title = `↔️ Substitution — ${event.team || 'Unknown'}`;
        const desc = `⬇️ ${event.player}\n⬆️ ${event.assist || 'Unknown'}\n⏱️ ${minute}`;
        return EmbedFactory.event(title, desc)
          .setAuthor({ name: `${home} vs ${away}`, iconURL: homeLogo })
          .setFooter({ text: `${league} · Substitution` });
      }

      case 'HALFTIME': {
        const desc = `${score}\n⏸️ Halftime at ${minute}`;
        return EmbedFactory.halftime(`${home} ${tracker.homeScore}–${tracker.awayScore} ${away} — Halftime`, desc)
          .setAuthor({ name: `${home} vs ${away}`, iconURL: homeLogo })
          .setFooter({ text: `${league} · Halftime` });
      }

      case 'FULLTIME': {
        const desc = `${score}\n🏁 ${event.detail || 'Full Time'}`;
        return EmbedFactory.fulltime(`${home} ${tracker.homeScore}–${tracker.awayScore} ${away} — Full Time`, desc)
          .setAuthor({ name: `${home} vs ${away}`, iconURL: homeLogo })
          .setFooter({ text: `${league} · Full Time` });
      }

      case 'PENALTY_SHOOTOUT': {
        const desc = `${score}\n🎯 Penalty shootout underway!`;
        return EmbedFactory.penalty(`${home} vs ${away} — Penalty Shootout`, desc)
          .setAuthor({ name: `${home} vs ${away}`, iconURL: homeLogo })
          .setFooter({ text: `${league} · Penalty Shootout` });
      }

      case 'LIVE_UPDATE': {
        const statusLine = tracker.status || match?.fixture?.status?.short || 'LIVE';
        const desc = `${score}\n⏱️ ${minute || 'LIVE'} · Status: ${statusLine}`;
        return EmbedFactory.live(`${home} vs ${away}`, desc)
          .setAuthor({ name: `${home} vs ${away}`, iconURL: homeLogo })
          .setFooter({ text: `${league} · Live Update · Updates every 60s` });
      }

      default: {
        return EmbedFactory.base('Match Update', `${score}\n⏱️ ${minute}`);
      }
    }
  }

  _formatLineups(lineups) {
    if (!lineups || !Array.isArray(lineups) || !lineups.length) return '*Lineups not available yet.*';
    try {
      return lineups.map((side) => {
        const team = side.team?.name || 'Team';
        const formation = side.formation ? `(${side.formation})` : '';
        const startXI = (side.startXI || []).slice(0, 11).map((p) => p.player?.name || '?').join(', ');
        return `**${team} ${formation}**\n${startXI}`;
      }).join('\n\n');
    } catch (err) {
      return '*Lineup format error.*';
    }
  }
}

module.exports = { MatchdayEngine };
