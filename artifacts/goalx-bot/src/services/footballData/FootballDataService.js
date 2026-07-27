'use strict';

const axios = require('axios');
const Bottleneck = require('bottleneck');
const pRetry = require('p-retry');
const config = require('../../config/config');
const { logger } = require('../../utils/logger');

/**
 * FootballDataService - Wrapper for the football-data.org API.
 * Used as primary or fallback data source alongside ApiFootball.
 */
class FootballDataService {
  constructor(cacheService) {
    this.cache = cacheService;
    this.baseUrl = config.apis.footballData.baseUrl;
    this.configured = Boolean(config.apis.footballData.key);
    this.headers = {
      'X-Auth-Token': config.apis.footballData.key || '',
    };

    // Free tier: 10 requests per minute
    this.limiter = new Bottleneck({
      reservoir: 10,
      reservoirRefreshAmount: 10,
      reservoirRefreshInterval: 60_000,
      maxConcurrent: 2,
      minTime: 300,
    });

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10_000,
      headers: this.headers,
    });
  }

  /**
   * Core request method with rate limiting, retry, and caching.
   */
  async request(endpoint, params = {}, cacheTtl = 300) {
    if (!this.configured) {
      throw new Error('FOOTBALL_DATA_KEY not configured');
    }

    const cacheKey = `fd:${endpoint}:${JSON.stringify(params)}`;

    return this.cache.getOrSet(cacheKey, async () => {
      return this.limiter.schedule(() =>
        pRetry(
          async () => {
            const response = await this.client.get(endpoint, { params });
            return response.data;
          },
          {
            retries: 3,
            factor: 2,
            minTimeout: 1000,
            onFailedAttempt: (error) => {
              logger.warn(`[FootballData] Attempt ${error.attemptNumber} failed for ${endpoint}: ${error.message}`);
              if (error.response?.status === 429) {
                throw new pRetry.AbortError('Rate limited by football-data.org');
              }
            },
          }
        )
      );
    }, cacheTtl);
  }

  // ─── Competitions ─────────────────────────────────────────────────────────────

  async getCompetitions() {
    return this.request('/competitions', {}, 86400);
  }

  async getCompetition(competitionCode) {
    return this.request(`/competitions/${competitionCode}`, {}, 86400);
  }

  async getCompetitionStandings(competitionCode, season = null) {
    const params = {};
    if (season) params.season = season;
    return this.request(`/competitions/${competitionCode}/standings`, params, 3600);
  }

  async getCompetitionMatches(competitionCode, matchday = null, status = null) {
    const params = {};
    if (matchday) params.matchday = matchday;
    if (status) params.status = status;
    return this.request(`/competitions/${competitionCode}/matches`, params, 300);
  }

  async getCompetitionTopScorers(competitionCode, season = null) {
    const params = {};
    if (season) params.season = season;
    return this.request(`/competitions/${competitionCode}/scorers`, params, 3600);
  }

  async getCompetitionTeams(competitionCode, season = null) {
    const params = {};
    if (season) params.season = season;
    return this.request(`/competitions/${competitionCode}/teams`, params, 86400);
  }

  // ─── Matches ─────────────────────────────────────────────────────────────────

  async getMatches(filters = {}) {
    return this.request('/matches', filters, 60);
  }

  async getMatchById(matchId) {
    return this.request(`/matches/${matchId}`, {}, 60);
  }

  async getLiveMatches() {
    return this.request('/matches', { status: 'IN_PLAY,PAUSED' }, 30);
  }

  /**
   * Convenience wrapper — returns today's matches.
   * Kept for backward compatibility with existing callers.
   */
  async getTodayMatches() {
    const today = new Date().toISOString().split('T')[0];
    return this.getMatchesByDate(today);
  }

  /**
   * Free-tier restriction: the generic /matches?dateFrom=X endpoint only returns
   * TIER_ONE competitions (yields 0 for most dates). Fix: fan out to each
   * free-tier competition's own endpoint in parallel, then merge.
   *
   * Works for ANY date (today, yesterday, etc.) — the date is passed through
   * so this can serve both /fixtures (today) and /results (past date).
   *
   * Rate-limit strategy: lazy waterfall.
   * football-data.org free tier = 10 req/min shared across ALL calls.
   * getLiveMatches() costs 1 slot → budget max 6 here.
   *
   * Tier 1 (1 req)  — active international tournament (WC → stops here if matches found)
   * Tier 2 (4 reqs) — top European leagues + CL
   * Tier 3 (2 reqs) — remaining leagues (only if tiers 1-2 empty)
   */
  async getMatchesByDate(date) {
    if (!this.configured) {
      throw new Error('FOOTBALL_DATA_KEY not configured');
    }

    const cacheKey = `fd:fixtures:${date}`;

    return this.cache.getOrSet(cacheKey, async () => {
      const TIERS = [
        ['WC'],                      // Tier 1 — 1 request
        ['CL', 'PL', 'PD', 'BL1'],  // Tier 2 — 4 requests
        ['SA', 'FL1'],               // Tier 3 — 2 requests (only if needed)
      ];
      const ENOUGH_MATCHES = 6;

      const allMatches = [];

      for (const tier of TIERS) {
        if (allMatches.length >= ENOUGH_MATCHES) break;

        const results = await Promise.allSettled(
          tier.map((code) =>
            this.limiter.schedule(() =>
              this.client
                .get(`/competitions/${code}/matches`, {
                  params: { dateFrom: date, dateTo: date },
                })
                .then((r) => ({ code, matches: r.data?.matches || [] }))
            )
          )
        );

        for (const res of results) {
          if (res.status === 'fulfilled' && res.value.matches.length > 0) {
            logger.debug(`[FootballData] ${res.value.code}: ${res.value.matches.length} match(es) on ${date}`);
            allMatches.push(...res.value.matches);
          } else if (res.status === 'rejected') {
            const status = res.reason?.response?.status;
            if (status !== 403 && status !== 404) {
              logger.warn(`[FootballData] getMatchesByDate(${date}): ${res.reason?.message}`);
            }
          }
        }
      }

      logger.debug(`[FootballData] getMatchesByDate(${date}) total: ${allMatches.length}`);
      return { count: allMatches.length, matches: allMatches };
    }, 300);
  }

  // ─── Teams ────────────────────────────────────────────────────────────────────

  async searchTeam(name) {
    return this.request('/teams', { search: name }, 3600);
  }

  async getTeam(teamId) {
    return this.request(`/teams/${teamId}`, {}, 3600);
  }

  async getTeamMatches(teamId, status = null, limit = 10) {
    const params = { limit };
    if (status) params.status = status;
    return this.request(`/teams/${teamId}/matches`, params, 300);
  }

  // ─── Competitions search (for searchLeague fallback) ─────────────────────────

  async searchCompetition(name) {
    // fd.org has no search param on /competitions — fetch all and filter locally
    const data = await this.request('/competitions', {}, 86400);
    const q = name.toLowerCase();
    const matches = (data.competitions || []).filter(
      (c) => c.name?.toLowerCase().includes(q) || c.area?.name?.toLowerCase().includes(q)
    );
    return { competitions: matches };
  }

  // ─── Persons (Players) ───────────────────────────────────────────────────────

  async getPerson(personId) {
    return this.request(`/persons/${personId}`, {}, 3600);
  }

  async getPersonMatches(personId, limit = 10) {
    return this.request(`/persons/${personId}/matches`, { limit }, 3600);
  }
}

module.exports = { FootballDataService };