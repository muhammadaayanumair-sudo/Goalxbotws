'use strict';

/**
 * GithubModelsProvider — GitHub Models (GPT-4.1 / GPT-5) via Azure inference endpoint.
 * Diagnostic & reasoning lane: logic validation, patch generation, code review.
 * Uses a GitHub PAT as the Bearer token.
 * Docs: https://docs.github.com/en/github-models
 */
class GithubModelsProvider {
  constructor() {
    this.apiKey = process.env.GITHUB_MODELS_TOKEN;
    this.baseUrl = 'https://models.inference.ai.azure.com';
    this.model = process.env.GITHUB_MODELS_MODEL || 'gpt-4.1';
    this.configured = Boolean(this.apiKey);
    this.name = 'github_models';
    this.displayName = 'GitHub Models (GPT-4.1)';
    this.role = 'Diagnostic lane — patch generation, logic validation, code review';
  }

  async chat(messages, { maxTokens = 2048, temperature = 0.2 } = {}) {
    if (!this.configured) throw new Error('GitHub Models token not configured');

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
      throw new Error(`GitHub Models API error ${response.status}: ${err}`);
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

module.exports = { GithubModelsProvider };
