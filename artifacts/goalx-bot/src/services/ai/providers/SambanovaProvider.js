'use strict';

const { logger } = require('../../../utils/logger');

/**
 * SambanovaProvider — high-throughput RDU inference via SambaNova Cloud.
 * OpenAI-compatible endpoint. Ideal for bulk data processing and heavy analytics.
 * Docs: https://cloud.sambanova.ai
 */
class SambanovaProvider {
  constructor() {
    this.apiKey = process.env.SABANOVA_API_KEY;
    this.baseUrl = 'https://api.sambanova.ai/v1';
    this.model = process.env.SAMBANOVA_MODEL || 'Meta-Llama-3.3-70B-Instruct';
    this.configured = Boolean(this.apiKey);
    this.name = 'sambanova';
    this.displayName = 'SambaNova Cloud';
    this.role = 'Bulk analytics — heavy stats processing, large-scale data ingestion';
  }

  async chat(messages, { maxTokens = 2048, temperature = 0.6 } = {}) {
    if (!this.configured) throw new Error('SambaNova API key not configured');

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000), // 60s for large payloads
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`SambaNova API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response generated.';
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

module.exports = { SambanovaProvider };
