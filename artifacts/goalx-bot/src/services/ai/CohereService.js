'use strict';

/**
 * CohereService — rerank incoming search results and news snippets.
 * Reorders a list of documents by relevance to a query so the best sources
 * surface first.
 * Docs: https://docs.cohere.com/docs/rerank
 */
class CohereService {
  constructor() {
    this.apiKey = process.env.COHERE_API_KEY;
    this.baseUrl = process.env.COHERE_BASE_URL || 'https://api.cohere.com/v1';
    this.model = process.env.COHERE_RERANK_MODEL || 'rerank-english-v3.0';
    this.configured = Boolean(this.apiKey);
    this.name = 'cohere';
    this.displayName = 'Cohere';
    this.role = 'Search reranker — prioritize news, results, and raw data';
  }

  /**
   * Rerank documents by relevance to a query.
   * @param {string} query
   * @param {Array<string|{text:string}>} documents
   * @param {Object} options
   * @param {number} [options.topN=5]
   * @param {boolean} [options.returnDocuments=true]
   * @returns {Promise<Array<{index:number, relevance_score:number, document?:*}>>}
   */
  async rerank(query, documents, { topN = 5, returnDocuments = true } = {}) {
    if (!this.configured) throw new Error('Cohere API key not configured');
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error('documents must be a non-empty array');
    }

    const normalized = documents.map((d) =>
      typeof d === 'string' ? d : d?.text ?? String(d)
    );

    const response = await fetch(`${this.baseUrl}/rerank`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        query,
        documents: normalized,
        top_n: topN,
        return_documents: returnDocuments,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`Cohere API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.results || [];
  }

  getStatus() {
    return {
      name: this.name,
      displayName: this.displayName,
      configured: this.configured,
      model: this.model,
      role: this.role,
    };
  }
}

module.exports = { CohereService };
