'use strict';

const axios  = require('axios');
const config = require('../../config/config');
const { logger } = require('../../utils/logger');

/**
 * NewsService — fetches football-only news from NewsAPI.org.
 * Free tier: 100 requests/day.
 * Docs: https://newsapi.org/docs
 */
class NewsService {
  constructor(cacheService) {
    this.cache      = cacheService;
    this.apiKey     = config.news.apiKey;
    this.configured = Boolean(this.apiKey);
    this.baseUrl    = 'https://newsapi.org/v2';

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 8000,
      headers: {
        'X-Api-Key':  this.apiKey || '',
        'User-Agent': 'GoalX-Bot/1.0',
      },
    });
  }

  async _request(endpoint, params = {}, ttl = 900) {
    if (!this.configured) {
      throw new Error(
        'News features are not set up yet. Ask the bot owner to add a `NEWS_API_KEY` ' +
        '(free at newsapi.org/register) to enable this command.'
      );
    }

    const cacheKey = `news:${endpoint}:${JSON.stringify(params)}`;
    const cached   = await this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get(endpoint, { params });

      if (response.data.status !== 'ok') {
        throw new Error(`NewsAPI error: ${response.data.message}`);
      }

      const articles = this._normalize(response.data.articles || []);
      await this.cache.set(cacheKey, articles, ttl);
      return articles;
    } catch (err) {
      logger.error('[NewsService] Request failed:', err.message);
      return [];
    }
  }

  _normalize(articles) {
    return articles
      .filter((a) => a.title && a.url && a.title !== '[Removed]')
      .map((a) => ({
        title:       a.title,
        description: a.description || '',
        link:        a.url,
        source:      a.source?.name || 'Unknown',
        publishedAt: a.publishedAt ? new Date(a.publishedAt) : new Date(),
        imageUrl:    a.urlToImage || null,
        author:      a.author     || null,
      }));
  }

  /**
   * Returns the latest football news using /everything with a strict
   * football-focused query. Avoids /top-headlines + category:sports which
   * returns all sports on the NewsAPI free tier.
   */
  async getLatestNews(limit = 10) {
    const articles = await this._request(
      '/everything',
      {
        q: '"football" OR "soccer" OR "Premier League" OR "Champions League" OR "La Liga" OR "Bundesliga" OR "Serie A" OR "Ligue 1" OR "Europa League" OR "FIFA" OR "UEFA"',
        language: 'en',
        sortBy:   'publishedAt',
        pageSize: Math.min(limit * 3, 100), // fetch extra so we can filter
      },
      900 // 15 min cache
    );

    return articles.slice(0, limit);
  }

  /**
   * Searches for news articles by keyword using /everything.
   */
  async searchNews(query, limit = 10) {
    return this._request(
      '/everything',
      {
        q:        query,
        language: 'en',
        sortBy:   'publishedAt',
        pageSize: Math.min(limit, 100),
      },
      900
    );
  }

  /**
   * Returns news filtered to a specific team name.
   */
  async getNewsByTeam(teamName) {
    return this.searchNews(`"${teamName}" football OR soccer`, 8);
  }

  /**
   * Returns latest transfer news and rumours.
   */
  async getTransferNews(limit = 8) {
    return this._request(
      '/everything',
      {
        q:        'football transfer signing rumour deal',
        language: 'en',
        sortBy:   'publishedAt',
        pageSize: Math.min(limit, 100),
      },
      1800
    );
  }

  /**
   * Returns news for a specific league or competition.
   */
  async getLeagueNews(leagueName, limit = 8) {
    return this.searchNews(`"${leagueName}" football`, limit);
  }
}

module.exports = { NewsService };
