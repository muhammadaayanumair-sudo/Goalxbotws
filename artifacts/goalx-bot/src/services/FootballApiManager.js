'use strict';

const axios = require('axios');
const config = require('../config/config');
const { logger } = require('../utils/logger');
const { FootballDataService } = require('./footballData/FootballDataService');

/**
 * Compatibility layer that provides the FootballApiManager interface expected by
 * the bot commands and schedulers while gracefully degrading when no football
 * API key is configured.
 *
 * It prefers API-Football when available, falls back to football-data.org when
 * configured, and otherwise returns empty results so the bot can still boot.
 */
class FootballApiManager {
  constructor(cacheService) {
    this.cache = cacheService;
    this.apiFootballConfigured = Boolean(config.apis.apiFootball.key);
    this.footballDataConfigured = Boolean(config.apis.footballData.key);
    this.fallbackService = this.footballDataConfigured ? new FootballDataService(cacheService) : null;
    this.baseUrl = config.apis.apiFootball.baseUrl;
    this.headers = {
      'x-apisports-key': config.apis.apiFootball.key || '',
      'Content-Type': 'application/json',
    };
  }

  async _apiRequest(endpoint, params = {}, cacheTtl = 300) {
    if (!this.apiFootballConfigured) {
      throw new Error('API_FOOTBALL_KEY not configured');
    }

    const cacheKey = `api-football:${endpoint}:${JSON.stringify(params)}`;
    return this.cache.getOrSet(cacheKey, async () => {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        params,
        headers: this.headers,
        timeout: 15_000,
      });
      return response.data;
    }, cacheTtl);
  }

  async _requestWithFallback(endpoint, params = {}, cacheTtl = 300, fallbackMethod = null) {
    try {
      return await this._apiRequest(endpoint, params, cacheTtl);
    } catch (error) {
      if (!this.fallbackService) {
        logger.warn(`[FootballApiManager] ${error.message}`);
        return null;
      }

      if (fallbackMethod) {
        try {
          return await fallbackMethod.call(this.fallbackService, params);
        } catch (fallbackErr) {
          logger.warn(`[FootballApiManager] fallback failed for ${endpoint}: ${fallbackErr.message}`);
          return null;
        }
      }

      logger.warn(`[FootballApiManager] Falling back to FootballDataService for ${endpoint}`);
      return null;
    }
  }

  _normalizeResponse(payload, key = 'response') {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (payload[key] !== undefined) return payload[key];
    return payload;
  }

  _normalizeFixtures(payload) {
    const items = this._normalizeResponse(payload, 'response');
    return Array.isArray(items) ? items : [];
  }

  _emptyArray() {
    return [];
  }

  _emptyObject() {
    return {};
  }

  async getLiveMatches() {
    const payload = await this._requestWithFallback('/fixtures', { live: 'all' }, 30, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getFixturesByDate(date) {
    const payload = await this._requestWithFallback('/fixtures', { date }, 300, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getFixturesByTeam(teamId, limit = 10) {
    const payload = await this._requestWithFallback('/fixtures', { team: teamId, last: limit }, 300, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getFixtureById(fixtureId) {
    const payload = await this._requestWithFallback('/fixtures', { id: fixtureId }, 60, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getFixtureEvents(fixtureId) {
    const payload = await this._requestWithFallback('/fixtures/events', { fixture: fixtureId }, 60, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getFixtureLineups(fixtureId) {
    const payload = await this._requestWithFallback('/fixtures/lineups', { fixture: fixtureId }, 60, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getFixtureStatistics(fixtureId) {
    const payload = await this._requestWithFallback('/fixtures/statistics', { fixture: fixtureId }, 60, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getFixturePredictions(fixtureId) {
    const payload = await this._requestWithFallback('/predictions', { fixture: fixtureId }, 60, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return response || {};
  }

  async searchTeam(name) {
    const payload = await this._requestWithFallback('/teams', { search: name }, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async searchPlayer(name) {
    const payload = await this._requestWithFallback('/players', { search: name }, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async searchLeague(name) {
    const payload = await this._requestWithFallback('/leagues', { search: name }, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getLeagueById(leagueId) {
    const payload = await this._requestWithFallback('/leagues', { id: leagueId }, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getStandings(leagueId, season = null) {
    const params = { league: leagueId };
    if (season) params.season = season;
    const payload = await this._requestWithFallback('/standings', params, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getTeamSquad(teamId) {
    const payload = await this._requestWithFallback('/players/squads', { team: teamId }, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getInjuries(teamId) {
    const payload = await this._requestWithFallback('/injuries', { team: teamId }, 300, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getTopScorers(leagueId, season = null) {
    const params = { league: leagueId };
    if (season) params.season = season;
    const payload = await this._requestWithFallback('/topscorers', params, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getTopAssists(leagueId, season = null) {
    const params = { league: leagueId };
    if (season) params.season = season;
    const payload = await this._requestWithFallback('/topassists', params, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getPlayerById(playerId, season = null) {
    const params = { id: playerId };
    if (season) params.season = season;
    const payload = await this._requestWithFallback('/players', params, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getHeadToHead(team1, team2, limit = 10) {
    const payload = await this._requestWithFallback('/fixtures/headtohead', { h2h: `${team1}-${team2}`, last: limit }, 300, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getVenueByTeam(teamId) {
    const payload = await this._requestWithFallback('/teams/venues', { team: teamId }, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async searchVenue(name) {
    const payload = await this._requestWithFallback('/venues', { search: name }, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getCoachByTeam(teamId) {
    const payload = await this._requestWithFallback('/coachs', { team: teamId }, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getTeamById(teamId) {
    const payload = await this._requestWithFallback('/teams', { id: teamId }, 3600, null).catch(() => null);
    const response = this._normalizeResponse(payload, 'response');
    return Array.isArray(response) ? response : [];
  }

  async getMatchesByDate(date) {
    return this.getFixturesByDate(date);
  }
}

module.exports = { FootballApiManager };
