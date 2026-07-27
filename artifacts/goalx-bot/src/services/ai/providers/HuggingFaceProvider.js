'use strict';

/**
 * HuggingFaceProvider — zero-shot micro-classifier and lightweight NLP.
 * Uses the Inference API for tasks like text classification, sentiment
 * tagging, and entity labelling. Not a chat provider.
 * Docs: https://huggingface.co/docs/api-inference
 */
class HuggingFaceProvider {
  constructor() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    this.baseUrl = 'https://api-inference.huggingface.co';
    this.model = process.env.HUGGINGFACE_MODEL || 'facebook/bart-large-mnli';
    this.configured = Boolean(this.apiKey);
    this.name = 'huggingface';
    this.displayName = 'Hugging Face';
    this.role = 'Zero-shot micro-classifier — text categorization and NLP tasks';
  }

  chat() {
    throw new Error('HuggingFace is not a chat provider; use classify() instead.');
  }

  /**
   * Zero-shot classification of a single text against a list of candidate labels.
   * @param {string} text
   * @param {string[]} labels
   * @returns {Promise<{labels: string[], scores: number[], sequence: string}>}
   */
  async classify(text, labels) {
    if (!this.configured) throw new Error('Hugging Face API key not configured');
    if (!Array.isArray(labels) || labels.length === 0) {
      throw new Error('At least one candidate label is required');
    }

    const response = await fetch(`${this.baseUrl}/models/${this.model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text,
        parameters: { candidate_labels: labels },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`Hugging Face API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    // Normalize common response shapes
    if (Array.isArray(data) && data[0]?.labels) {
      return { labels: data[0].labels, scores: data[0].scores, sequence: text };
    }
    if (data.labels && data.scores) {
      return { labels: data.labels, scores: data.scores, sequence: text };
    }
    return data;
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

module.exports = { HuggingFaceProvider };