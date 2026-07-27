'use strict';

const { logger } = require('../../utils/logger');
const { CircuitBreaker } = require('./CircuitBreaker');
const { CerebrasProvider }     = require('./providers/CerebrasProvider');
const { SambanovaProvider }    = require('./providers/SambanovaProvider');
const { GlmProvider }          = require('./providers/GlmProvider');
const { GithubModelsProvider } = require('./providers/GithubModelsProvider');
const { OllamaProvider }       = require('./providers/OllamaProvider');
const { SiliconFlowProvider }  = require('./providers/SiliconFlowProvider');
const { XaiProvider }          = require('./providers/XaiProvider');
const { HuggingFaceProvider }  = require('./providers/HuggingFaceProvider');
const { ExaService }           = require('./ExaService');
const { CohereService }        = require('./CohereService');

const BASE_SYSTEM_PROMPT = `You are GoalX AI, an elite football (soccer) analyst and assistant.
You have deep knowledge of football history, tactics, statistics, players, teams, leagues, and competitions worldwide.
You can:
- Analyze matches, teams, and players with expert insight
- Predict match outcomes with probabilistic reasoning
- Explain football tactics, formations, and strategies
- Discuss football history, records, and famous moments
- Answer questions about rules, VAR, offside, etc.
- Provide transfer speculation and market analysis

Always be concise, accurate, and engaging. Format responses for Discord (max 1800 characters).
Use football terminology correctly. Be balanced and analytical, not just a fan.
If you don't have data, say so clearly rather than guessing.
When [Context data] is provided, prioritize it over your internal training data for current player clubs, transfers, leagues, and recent scores. If the context contradicts your prior knowledge, trust the context.`;

function getSystemPrompt() {
  return `${BASE_SYSTEM_PROMPT}\n\nToday's date: ${new Date().toISOString().split('T')[0]}.`;
}

/**
 * AiProviderRouter — intelligent routing waterfall across all 9 AI providers
 * plus Exa, Cohere, and Hugging Face for search/grounding/reranking/classification.
 *
 * Task-based routing strategy:
 *   live_chat    → Cerebras (speed) → Groq → SiliconFlow → xAI → GLM → Ollama
 *   analytics    → SambaNova → OpenRouter → SiliconFlow → xAI → GLM → Groq → Ollama
 *   diagnostic   → GLM + GPT (parallel consensus) → OpenRouter → Groq
 *   general      → Groq → OpenRouter → Cerebras → SambaNova → SiliconFlow → xAI → GLM → Ollama
 *   fallback     → any available provider in priority order
 *   search       → Exa
 *   rerank       → Cohere
 *   classify     → Hugging Face
 *   sentiment    → xAI → Groq → OpenRouter
 *
 * Circuit breakers trip on 3 consecutive failures, reset after 60s.
 * Groq and OpenRouter are integrated via AiService (passed in), all others
 * are managed directly here.
 */
class AiProviderRouter {
  constructor(aiService) {
    this.aiService = aiService; // existing AiService (Groq + OpenRouter)
    this.cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 60_000 });

    // New providers
    this.cerebras    = new CerebrasProvider();
    this.sambanova   = new SambanovaProvider();
    this.glm         = new GlmProvider();
    this.githubModels = new GithubModelsProvider();
    this.ollama      = new OllamaProvider();
    this.siliconflow = new SiliconFlowProvider();
    this.xai         = new XaiProvider();
    this.huggingface = new HuggingFaceProvider();

    // Search, reranking, and grounding services
    this.exa         = new ExaService();
    this.cohere      = new CohereService();

    this.conversationHistory = new Map(); // Backwards-compatible per-user chat history

    this._logStartup();
  }

  _logStartup() {
    const providers = [
      `Groq(${this.aiService.groqConfigured ? '✓' : '✗'})`,
      `OpenRouter(${this.aiService.orConfigured ? '✓' : '✗'})`,
      `Cerebras(${this.cerebras.configured ? '✓' : '✗'})`,
      `SambaNova(${this.sambanova.configured ? '✓' : '✗'})`,
      `GLM(${this.glm.configured ? '✓' : '✗'})`,
      `GitHubModels(${this.githubModels.configured ? '✓' : '✗'})`,
      `SiliconFlow(${this.siliconflow.configured ? '✓' : '✗'})`,
      `xAI(${this.xai.configured ? '✓' : '✗'})`,
      `HuggingFace(${this.huggingface.configured ? '✓' : '✗'})`,
      `Exa(${this.exa.configured ? '✓' : '✗'})`,
      `Cohere(${this.cohere.configured ? '✓' : '✗'})`,
      `Ollama(local)`,
    ];
    logger.info(`[AiRouter] Initialized: ${providers.join(' | ')}`);
  }

  /** Attempt a single provider, recording circuit-breaker outcome. */
  async _try(name, fn) {
    if (!this.cb.isAvailable(name)) {
      throw new Error(`${name} circuit is OPEN`);
    }
    try {
      const result = await fn();
      this.cb.recordSuccess(name);
      return result;
    } catch (err) {
      this.cb.recordFailure(name);
      throw err;
    }
  }

  /** Run through a waterfall of [name, fn] pairs — returns first success. */
  async _waterfall(steps, taskLabel) {
    const errors = [];
    for (const [name, fn] of steps) {
      try {
        const result = await this._try(name, fn);
        if (errors.length > 0) {
          logger.info(`[AiRouter] ${taskLabel} succeeded via ${name} after ${errors.length} failure(s)`);
        }
        return { result, provider: name };
      } catch (err) {
        errors.push(`${name}: ${err.message}`);
        logger.warn(`[AiRouter] ${taskLabel} — ${name} failed: ${err.message}`);
      }
    }
    throw new Error(
      `All providers failed for "${taskLabel}":\n${errors.map(e => `  • ${e}`).join('\n')}`
    );
  }

  // ── Task-specific routing ─────────────────────────────────────────────────

  /**
   * Live chat — prioritizes speed (Cerebras LPU).
   * Waterfall: Cerebras → Groq → SiliconFlow → xAI → GLM → Ollama
   */
  async liveChat(messages, opts = {}) {
    const { maxTokens = 512, temperature = 0.8 } = opts;
    return this._waterfall([
      ['cerebras',    () => this.cerebras.chat(messages, { maxTokens, temperature })],
      ['groq',        () => this._groqChat(messages, maxTokens, temperature)],
      ['siliconflow', () => this.siliconflow.chat(messages, { maxTokens, temperature })],
      ['xai',         () => this.xai.chat(messages, { maxTokens, temperature })],
      ['glm',         () => this.glm.chat(messages, { maxTokens, temperature })],
      ['ollama',      () => this.ollama.chat(messages, { maxTokens, temperature })],
    ], 'liveChat');
  }

  /**
   * Heavy analytics — prioritizes throughput (SambaNova RDU).
   * Waterfall: SambaNova → OpenRouter → SiliconFlow → xAI → GLM → Groq → Ollama
   */
  async analytics(messages, opts = {}) {
    const { maxTokens = 2048, temperature = 0.6 } = opts;
    return this._waterfall([
      ['sambanova',    () => this.sambanova.chat(messages, { maxTokens, temperature })],
      ['openrouter',   () => this._orChat(messages, maxTokens, temperature)],
      ['siliconflow',  () => this.siliconflow.chat(messages, { maxTokens, temperature })],
      ['xai',          () => this.xai.chat(messages, { maxTokens, temperature })],
      ['glm',          () => this.glm.chat(messages, { maxTokens, temperature })],
      ['groq',         () => this._groqChat(messages, maxTokens, temperature)],
      ['ollama',       () => this.ollama.chat(messages, { maxTokens, temperature })],
    ], 'analytics');
  }

  /**
   * General purpose — balanced quality/speed.
   * Waterfall: Groq → OpenRouter → Cerebras → SambaNova → SiliconFlow → xAI → GLM → Ollama
   */
  async general(messages, opts = {}) {
    const { maxTokens = 1024, temperature = 0.7 } = opts;
    return this._waterfall([
      ['groq',         () => this._groqChat(messages, maxTokens, temperature)],
      ['openrouter',   () => this._orChat(messages, maxTokens, temperature)],
      ['cerebras',     () => this.cerebras.chat(messages, { maxTokens, temperature })],
      ['sambanova',    () => this.sambanova.chat(messages, { maxTokens, temperature })],
      ['siliconflow',  () => this.siliconflow.chat(messages, { maxTokens, temperature })],
      ['xai',          () => this.xai.chat(messages, { maxTokens, temperature })],
      ['glm',          () => this.glm.chat(messages, { maxTokens, temperature })],
      ['ollama',       () => this.ollama.chat(messages, { maxTokens, temperature })],
    ], 'general');
  }

  /**
   * Social sentiment — uses xAI Grok's real-time reasoning first.
   * Waterfall: xAI → Groq → OpenRouter
   */
  async sentiment(messages, opts = {}) {
    const { maxTokens = 900, temperature = 0.65 } = opts;
    return this._waterfall([
      ['xai',        () => this.xai.chat(messages, { maxTokens, temperature })],
      ['groq',       () => this._groqChat(messages, maxTokens, temperature)],
      ['openrouter', () => this._orChat(messages, maxTokens, temperature)],
    ], 'sentiment');
  }

  /**
   * Diagnostic — dual-engine parallel consensus (GLM + GitHub Models).
   * Both engines analyze independently; results are returned together.
   * Falls back to single-engine if one is unavailable.
   */
  async diagnostic(messages, opts = {}) {
    const { maxTokens = 2048, temperature = 0.2 } = opts;

    const glmAvail = this.glm.configured && this.cb.isAvailable('glm');
    const gptAvail = this.githubModels.configured && this.cb.isAvailable('github_models');

    const results = await Promise.allSettled([
      glmAvail
        ? this._try('glm', () => this.glm.chat(messages, { maxTokens, temperature }))
        : Promise.reject(new Error('GLM unavailable')),
      gptAvail
        ? this._try('github_models', () => this.githubModels.chat(messages, { maxTokens, temperature }))
        : Promise.reject(new Error('GitHub Models unavailable')),
    ]);

    const glmResult  = results[0].status === 'fulfilled' ? results[0].value : null;
    const gptResult  = results[1].status === 'fulfilled' ? results[1].value : null;

    if (glmResult && gptResult) {
      return { glm: glmResult, gpt: gptResult, consensus: true };
    }
    if (glmResult) return { glm: glmResult, gpt: null, consensus: false };
    if (gptResult) return { glm: null, gpt: gptResult, consensus: false };

    // Both failed — waterfall to OpenRouter
    logger.warn('[AiRouter] Dual diagnostic engines unavailable, falling back to OpenRouter');
    const { result } = await this._waterfall([
      ['openrouter', () => this._orChat(messages, maxTokens, temperature)],
      ['groq',       () => this._groqChat(messages, maxTokens, temperature)],
    ], 'diagnostic-fallback');
    return { glm: result, gpt: null, consensus: false, fallback: true };
  }

  // ── Private wrappers for AiService's Groq/OpenRouter ───────────────────────

  async _groqChat(messages, maxTokens, temperature) {
    if (!this.aiService.groqConfigured) throw new Error('Groq not configured');
    return this.aiService._groqChat(messages, maxTokens, temperature);
  }

  async _orChat(messages, maxTokens, temperature) {
    if (!this.aiService.orConfigured) throw new Error('OpenRouter not configured');
    return this.aiService._orChat(messages, maxTokens, temperature);
  }

  // ── Health & status ─────────────────────────────────────────────────────────

  /** Full provider status snapshot for /sysreview. */
  getProviderStatus() {
    return {
      groq: {
        name: 'groq', displayName: 'Groq',
        configured: this.aiService.groqConfigured,
        model: this.aiService.groqModel,
        role: 'Speed — chat, explain, bios, chants',
      },
      openrouter: {
        name: 'openrouter', displayName: 'OpenRouter',
        configured: this.aiService.orConfigured,
        model: this.aiService.orModel,
        role: 'Quality — analysis, predictions, recaps',
      },
      ...Object.fromEntries(
        [this.cerebras, this.sambanova, this.glm, this.githubModels,
         this.siliconflow, this.xai, this.huggingface, this.ollama]
          .map(p => [p.name, p.getStatus()])
      ),
      exa: this.exa.getStatus(),
      cohere: this.cohere.getStatus(),
    };
  }

  getCircuitStatus() {
    return this.cb.getAllStatus();
  }

  resetCircuit(providerName) {
    this.cb.reset(providerName);
  }

  // ── Backwards-compatible API surface (exposes the same methods as AiService) ─
  // All calls are routed through the 7-provider waterfall instead of a single provider.

  /** Conversational chat — routes through the general-purpose waterfall and keeps per-user history. */
  async chat(userId, userMessage, contextData = null) {
    if (!this.aiService.configured) {
      throw new Error('AI features are not set up yet. Ask the bot owner to add `GROQ_API_KEY` or `OPENROUTER_API_KEY`.');
    }

    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }
    const history = this.conversationHistory.get(userId);

    let fullMessage = userMessage;
    if (contextData) {
      fullMessage = `[Context data: ${JSON.stringify(contextData)}]\n\n${userMessage}`;
    }
    history.push({ role: 'user', content: fullMessage });
    if (history.length > 20) history.splice(0, history.length - 20);

    const messages = [{ role: 'system', content: getSystemPrompt() }, ...history];
    const { result } = await this.general(messages, { maxTokens: 1024, temperature: 0.7 });

    history.push({ role: 'assistant', content: result });
    return result;
  }

  clearHistory(userId) {
    this.conversationHistory.delete(userId);
  }

  getHistoryLength(userId) {
    return this.conversationHistory.get(userId)?.length || 0;
  }

  /** Team analysis — routed through the analytics (quality) waterfall. */
  async analyzeTeam(teamName, statsData = null) {
    const prompt = statsData
      ? `Analyze the football club **${teamName}** using this data: ${JSON.stringify(statsData)}.\n\nCover: tactical setup, current form, key players, strengths, weaknesses, and season outlook.`
      : `Provide a comprehensive analysis of **${teamName}**. Cover: history and achievements, current squad strengths, tactical approach, key players, weaknesses, and expectations for the current season.`;
    const { result } = await this.analytics(
      [{ role: 'system', content: getSystemPrompt() }, { role: 'user', content: prompt }],
      { maxTokens: 1000, temperature: 0.65 }
    );
    return result;
  }

  /** Player analysis — routed through the analytics waterfall. */
  async analyzePlayer(playerName, statsData = null) {
    const prompt = statsData
      ? `Analyze the football player **${playerName}** based on these statistics: ${JSON.stringify(statsData)}.\n\nCover: overall assessment, key strengths, main weaknesses, playing style, impact on their team, and potential.`
      : `Provide a thorough analysis of the football player **${playerName}**. Cover their career highlights, playing style, strengths, weaknesses, best positions, and overall significance to football.`;
    const { result } = await this.analytics(
      [{ role: 'system', content: getSystemPrompt() }, { role: 'user', content: prompt }],
      { maxTokens: 1000, temperature: 0.65 }
    );
    return result;
  }

  /** Explain a concept — routed through the general (fast/quality) waterfall with a 24h cache. */
  async explain(topic) {
    const cacheKey = `ai:explain:${topic.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (this.aiService.cache) {
      const cached = await this.aiService.cache.get(cacheKey);
      if (cached) return cached;
    }
    const { result } = await this.general(
      [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: `Explain this football concept clearly and engagingly: "${topic}". Make it understandable for both beginners and experienced fans. Use examples where helpful.` },
      ],
      { maxTokens: 700, temperature: 0.5 }
    );
    if (this.aiService.cache) {
      await this.aiService.cache.set(cacheKey, result, 86400);
    }
    return result;
  }

  /** Player bio — routed through the general waterfall with a 24h cache. */
  async playerBio(playerName, profileData = null) {
    const cacheKey = `ai:bio:${playerName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (this.aiService.cache) {
      const cached = await this.aiService.cache.get(cacheKey);
      if (cached) return cached;
    }
    const prompt = profileData
      ? `Write a short, engaging biography (3-4 sentences) of footballer ${playerName}. Use ONLY the following data as the source of truth for current club, nationality, age, position, and season stats. If the data contradicts your training data, trust the data. Data: ${JSON.stringify(profileData)}.`
      : `Write a short, engaging biography (3-4 sentences) of footballer ${playerName}. Cover their career highlights and what makes them notable. If asked about current club or transfer status, say you don't have live data unless context is provided.`;
    const { result } = await this.general(
      [{ role: 'system', content: getSystemPrompt() }, { role: 'user', content: prompt }],
      { maxTokens: 400, temperature: 0.65 }
    );
    if (this.aiService.cache) {
      await this.aiService.cache.set(cacheKey, result, 86400);
    }
    return result;
  }

  /** Partner scouting report — routed through analytics (quality) waterfall. */
  async scoutPlayer(playerName) {
    const cacheKey = `ai:scout:${playerName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (this.aiService.cache) {
      const cached = await this.aiService.cache.get(cacheKey);
      if (cached) return cached;
    }
    const { result } = await this.analytics(
      [
        { role: 'system', content: getSystemPrompt() },
        {
          role: 'user',
          content: `Generate a detailed scouting report for **${playerName}** as if you are a top football scout.\n\nStructure it as:\n1. **Profile** — age, position, club, nationality\n2. **Key Strengths** — 3 specific strengths with brief explanations\n3. **Weaknesses** — 2 areas of improvement\n4. **Playing Style** — how they operate in 2-3 sentences\n5. **Potential** — ceiling, trajectory, future value\n6. **Scout Verdict** — one sentence summary rating (Poor/Average/Good/Excellent/World Class)\n\nBe specific, analytical, and honest. Use real data you know.`,
        },
      ],
      { maxTokens: 1200, temperature: 0.6 }
    );
    if (this.aiService.cache) {
      await this.aiService.cache.set(cacheKey, result, 43200);
    }
    return result;
  }

  /** Partner tactical breakdown — routed through analytics. */
  async tacticalBreakdown(teamName) {
    const cacheKey = `ai:tactics:${teamName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (this.aiService.cache) {
      const cached = await this.aiService.cache.get(cacheKey);
      if (cached) return cached;
    }
    const { result } = await this.analytics(
      [
        { role: 'system', content: getSystemPrompt() },
        {
          role: 'user',
          content: `Provide a full tactical breakdown of **${teamName}** as a professional analyst.\n\nCover:\n1. **Formation** — primary shape and variations\n2. **Pressing Style** — high press, mid-block, or low block?\n3. **Build-up Play** — how they progress from defense to attack\n4. **Attacking Patterns** — key movements and combinations in the final third\n5. **Set Pieces** — corners, free kicks approach\n6. **Defensive Shape** — how they defend without the ball\n7. **Weaknesses to Exploit** — tactical vulnerabilities an opponent should target\n\nBe specific and tactical — this is for a serious football analyst.`,
        },
      ],
      { maxTokens: 1300, temperature: 0.6 }
    );
    if (this.aiService.cache) {
      await this.aiService.cache.set(cacheKey, result, 43200);
    }
    return result;
  }

  // ── Search, reranking, and classification services ───────────────────────────

  /**
   * Neural semantic web search — Exa.
   * Returns a list of grounded web results with text snippets.
   */
  async search(query, opts = {}) {
    if (!this.exa.configured) throw new Error('Exa is not configured. Add EXA_API_KEY to enable web search.');
    return this.exa.search(query, opts);
  }

  /**
   * Rerank a list of documents by relevance to a query — Cohere.
   */
  async rerank(query, documents, opts = {}) {
    if (!this.cohere.configured) throw new Error('Cohere is not configured. Add COHERE_API_KEY to enable reranking.');
    return this.cohere.rerank(query, documents, opts);
  }

  /**
   * Zero-shot text classification — Hugging Face.
   * @param {string} text
   * @param {string[]} labels
   */
  async classify(text, labels, opts = {}) {
    if (!this.huggingface.configured) throw new Error('Hugging Face is not configured. Add HUGGINGFACE_API_KEY to enable classification.');
    return this.huggingface.classify(text, labels, opts);
  }

  /**
   * Social sentiment analysis — xAI Grok first, then fallback to chat providers.
   * Prompt should ask the model to summarize the tone/hype around a topic.
   */
  async analyzeSentiment(topic, opts = {}) {
    const { result } = await this.sentiment(
      [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: `Analyze the current social media sentiment and hype around "${topic}" in football. Give a one-sentence sentiment label (very positive / positive / neutral / negative / very negative), the intensity (1-10), and a 2-sentence summary of what fans are talking about right now. If you have no live data, say so clearly.` },
      ],
      opts
    );
    return result;
  }

  /** Convenience alias that maps to the appropriate task router. */
  async route(task, messages, opts = {}) {
    switch (task) {
      case 'liveChat':  return this.liveChat(messages, opts);
      case 'analytics': return this.analytics(messages, opts);
      case 'diagnostic': return this.diagnostic(messages, opts);
      case 'sentiment': return this.sentiment(messages, opts);
      case 'general':
      default:          return this.general(messages, opts);
    }
  }
}

module.exports = { AiProviderRouter };