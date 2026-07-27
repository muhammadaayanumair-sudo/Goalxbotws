'use strict';

const { logger } = require('../../../utils/logger');

/**
 * OllamaProvider — 100% local/air-gapped inference via Ollama.
 * Zero-cost offline fallback and sandbox testing lane.
 * Endpoint: OLLAMA_API_URL (default: http://localhost:11434)
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 */
class OllamaProvider {
  constructor() {
    this.apiUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama3.2';
    this.name = 'ollama';
    this.displayName = 'Ollama (Local)';
    this.role = 'Air-gapped fallback — offline dev, sandbox testing, zero-cost';
    this._reachable = null; // cached reachability result
  }

  get configured() {
    // Ollama is always "configured" — it's a local service
    // but we track reachability separately
    return true;
  }

  /** Probe Ollama to see if it's reachable (cached for 60s). */
  async isReachable() {
    try {
      const ctrl = AbortSignal.timeout(3_000);
      const res = await fetch(`${this.apiUrl}/api/tags`, { signal: ctrl });
      this._reachable = res.ok;
    } catch {
      this._reachable = false;
    }
    return this._reachable;
  }

  async chat(messages, { maxTokens = 1024, temperature = 0.7 } = {}) {
    const reachable = await this.isReachable();
    if (!reachable) throw new Error(`Ollama not reachable at ${this.apiUrl}`);

    // Ollama supports OpenAI-compatible /v1/chat/completions endpoint
    const response = await fetch(`${this.apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000), // local models can be slow
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`Ollama error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response generated.';
  }

  getStatus() {
    return {
      name: this.name,
      displayName: this.displayName,
      configured: this.configured,
      reachable: this._reachable,
      model: this.model,
      endpoint: this.apiUrl,
      role: this.role,
    };
  }
}

module.exports = { OllamaProvider };
