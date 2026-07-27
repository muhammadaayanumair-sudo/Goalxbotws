'use strict';

/**
 * SiliconFlowProvider — open-weights model gateway.
 * Unified OpenAI-compatible endpoint for Qwen, DeepSeek, Llama, and other
 * open-source models served cost-effectively on SiliconFlow.
 * Docs: https://docs.siliconflow.cn
 */
class SiliconFlowProvider {
  constructor() {
    this.apiKey = process.env.SILICON_FLOW_API;
    this.baseUrl = process.env.SILICON_FLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
    this.model = process.env.SILICON_FLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct';
    this.configured = Boolean(this.apiKey);
    this.name = 'siliconflow';
    this.displayName = 'SiliconFlow';
    this.role = 'Open-weights gateway — Qwen, DeepSeek, Llama model pool';
  }

  async chat(messages, { maxTokens = 1024, temperature = 0.7 } = {}) {
    if (!this.configured) throw new Error('SiliconFlow API key not configured');

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
      throw new Error(`SiliconFlow API error ${response.status}: ${err}`);
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

module.exports = { SiliconFlowProvider };
