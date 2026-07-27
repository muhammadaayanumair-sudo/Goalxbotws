'use strict';

/**
 * GlmProvider — Z.ai GLM-4/5 via ZhipuAI BigModel API.
 * Diagnostic & reasoning lane: code auditing, AST validation, fault isolation.
 * API key format: "<id>.<secret>" — used directly as Bearer token.
 * Docs: https://open.bigmodel.cn/dev/api
 */
class GlmProvider {
  constructor() {
    this.apiKey = process.env.GLM_API;
    this.baseUrl = 'https://open.bigmodel.cn/api/paas/v4';
    this.model = process.env.GLM_MODEL || 'glm-4-air';
    this.configured = Boolean(this.apiKey);
    this.name = 'glm';
    this.displayName = 'Z.ai GLM-5';
    this.role = 'Diagnostic lane — code auditing, AST validation, fault isolation';
  }

  async chat(messages, { maxTokens = 2048, temperature = 0.3 } = {}) {
    if (!this.configured) throw new Error('GLM API key not configured');

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
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`GLM API error ${response.status}: ${err}`);
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

module.exports = { GlmProvider };
