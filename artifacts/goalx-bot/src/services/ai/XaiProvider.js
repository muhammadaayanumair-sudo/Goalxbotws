'use strict';

/**
 * XaiProvider — xAI Grok real-time reasoning and sentiment analysis.
 * OpenAI-compatible endpoint. Primary lane for live social sentiment and
 * real-time match hype (e.g. "What is X saying about this match?").
 * Docs: https://docs.x.ai
 */
class XaiProvider {
  constructor() {
    this.apiKey = process.env.xAi_API_KEY;
    this.baseUrl = process.env.XAI_BASE_URL || 'https://api.x.ai/v1';
    this.model = process.env.XAI_MODEL || 'grok-2-latest';
    this.configured = Boolean(this.apiKey);
    this.name = 'xai';
    this.displayName = 'xAI Grok';
    this.role = 'Real-time social sentiment radar — live reasoning and hype analysis';
  }

  async chat(messages, { maxTokens = 1024, temperature = 0.7 } = {}) {
    if (!this.configured) throw new Error('xAI API key not configured');

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
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`xAI API error ${response.status}: ${err}`);
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

module.exports = { XaiProvider };
