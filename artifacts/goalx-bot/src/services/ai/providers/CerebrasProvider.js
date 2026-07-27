'use strict';

const { logger } = require('../../../utils/logger');

/**
 * CerebrasProvider — ultra-fast LPU inference via Cerebras Cloud API.
 * OpenAI-compatible endpoint. Ideal for live match chats and real-time events.
 * Docs: https://inference-docs.cerebras.ai
 */
class CerebrasProvider {
  constructor() {
    this.apiKey = process.env.CLOUD_CEREBRAS_API_KEY;
    this.baseUrl = 'https://api.cerebras.ai/v1';
    this.model = process.env.CEREBRAS_MODEL || 'llama-4-scout-17b-16e-instruct';
    this.configured = Boolean(this.apiKey);
    this.name = 'cerebras';
    this.displayName = 'Cerebras Cloud';
    this.role = 'Ultra-fast LPU — live match chats, real-time events';
  }

  async chat(messages, { maxTokens = 1024, temperature = 0.7 } = {}) {
    if (!this.configured) throw new Error('Cerebras API key not configured');

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
      }),
      signal: AbortSignal.timeout(15_000), // 15s — Cerebras should respond sub-second
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`Cerebras API error ${response.status}: ${err}`);
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

module.exports = { CerebrasProvider };
