'use strict';

const { logger } = require('../../utils/logger');

/**
 * ExaService — neural semantic web search for grounding football data.
 * Finds precise, high-quality web results and returns clean text snippets.
 * Docs: https://docs.exa.ai
 */
class ExaService {
  constructor() {
    this.apiKey = process.env.EXA_API_KEY;
    this.baseUrl = process.env.EXA_BASE_URL || 'https://api.exa.ai';
    this.configured = Boolean(this.apiKey);
    this.name = 'exa';
    this.displayName = 'Exa';
    this.role = 'Neural semantic web search — football data grounding';
  }

  /**
   * Search the web for a football query.
   * @param {string} query
   * @param {Object} options
   * @param {number} [options.numResults=5]
   * @param {boolean} [options.useAutoprompt=true]
   * @param {boolean} [options.includeText=true]
   * @returns {Promise<Array<{title:string, url:string, text:string, id:string}>>}
   */
  async search(query, { numResults = 5, useAutoprompt = true, includeText = true } = {}) {
    if (!this.configured) throw new Error('Exa API key not configured');

    const body = {
      query,
      type: 'neural',
      numResults,
      useAutoprompt,
    };
    if (includeText) {
      body.contents = { text: true };
    }

    logger.debug(`[ExaService] Searching: ${query}`);

    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`Exa API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return (data.results || []).map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      text: r.text,
      publishedDate: r.publishedDate,
      author: r.author,
    }));
  }

  getStatus() {
    return {
      name: this.name,
      displayName: this.displayName,
      configured: this.configured,
      role: this.role,
    };
  }
}

module.exports = { ExaService };
