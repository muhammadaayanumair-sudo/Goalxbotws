'use strict';

const Groq = require('groq-sdk');
const axios = require('axios');
const config = require('../../config/config');
const { logger } = require('../../utils/logger');

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
 * Routing strategy:
 *
 *  Groq (fast LPU)       → quick chat, explain, chants, bios — speed matters
 *  OpenRouter (quality)  → deep analysis, predictions, recaps — reasoning matters
 *
 * OpenRouter automatically falls back to Groq if the key is missing or the
 * request fails, so the bot degrades gracefully rather than erroring out.
 */
class AiService {
  constructor(cacheService) {
    this.cache = cacheService;

    // Groq client
    this.groqConfigured = Boolean(config.ai.apiKey);
    this.groq = this.groqConfigured ? new Groq({ apiKey: config.ai.apiKey }) : null;
    this.groqModel = config.ai.model;
    this.groqMaxTokens = config.ai.maxTokens;

    // OpenRouter client (uses OpenAI-compatible REST via axios)
    this.orConfigured = Boolean(config.ai.openRouterApiKey);
    this.orModel = config.ai.openRouterModel;
    this.orBaseUrl = config.ai.openRouterBaseUrl;

    // Per-user conversation history: userId -> messages[]
    this.conversationHistory = new Map();

    if (this.groqConfigured && this.orConfigured) {
      logger.info('[AiService] Dual-provider mode: Groq (speed) + OpenRouter (quality)');
    } else if (this.groqConfigured) {
      logger.info('[AiService] Single-provider mode: Groq only');
    } else if (this.orConfigured) {
      logger.info('[AiService] Single-provider mode: OpenRouter only');
    } else {
      logger.warn('[AiService] No AI provider configured — AI commands disabled');
    }
  }

  get configured() {
    return this.groqConfigured || this.orConfigured;
  }

  _assertConfigured() {
    if (!this.configured) {
      throw new Error(
        'AI features are not set up yet. Ask the bot owner to add `GROQ_API_KEY` or `OPENROUTER_API_KEY` to enable this command.'
      );
    }
  }

  // ── Groq: fast path ──────────────────────────────────────────────────────────

  async _groqChat(messages, maxTokens = null, temperature = 0.7) {
    if (!this.groqConfigured) throw new Error('Groq not configured');
    const completion = await this.groq.chat.completions.create({
      model: this.groqModel,
      max_tokens: maxTokens ?? this.groqMaxTokens,
      temperature,
      messages,
    });
    return completion.choices[0]?.message?.content || 'No response generated.';
  }

  // ── OpenRouter: quality path ─────────────────────────────────────────────────

  async _orChat(messages, maxTokens = 1200, temperature = 0.7) {
    if (!this.orConfigured) throw new Error('OpenRouter not configured');
    const response = await axios.post(
      `${this.orBaseUrl}/chat/completions`,
      {
        model: this.orModel,
        max_tokens: maxTokens,
        temperature,
        messages,
      },
      {
        headers: {
          Authorization: `Bearer ${config.ai.openRouterApiKey}`,
          'HTTP-Referer': 'https://goalx.app',
          'X-Title': 'GoalX Football Bot',
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      }
    );
    return response.data?.choices?.[0]?.message?.content || 'No response generated.';
  }

  /**
   * Routes to OpenRouter (quality) with automatic Groq fallback.
   * Used for all deep-analysis tasks.
   */
  async _qualityChat(messages, maxTokens = 1200, temperature = 0.65) {
    if (this.orConfigured) {
      try {
        return await this._orChat(messages, maxTokens, temperature);
      } catch (err) {
        logger.warn(`[AiService] OpenRouter failed, falling back to Groq: ${err.message}`);
      }
    }
    // Fallback to Groq
    return this._groqChat(messages, maxTokens, temperature);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Conversational chat — uses Groq for speed, falls back to OpenRouter.
   * Maintains per-user conversation history (max 20 messages).
   */
  async chat(userId, userMessage, contextData = null) {
    this._assertConfigured();
    try {
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

      let assistantMessage;
      try {
        // Prefer Groq for chat — faster response for back-and-forth
        assistantMessage = this.groqConfigured
          ? await this._groqChat(messages)
          : await this._orChat(messages);
      } catch (err) {
        // Fallback: if Groq failed try OpenRouter
        if (this.orConfigured) {
          assistantMessage = await this._orChat(messages);
        } else {
          throw err;
        }
      }

      history.push({ role: 'assistant', content: assistantMessage });
      return assistantMessage;
    } catch (err) {
      logger.error('[AiService] chat() error:', err.message);
      if (err.status === 401 || err.response?.status === 401) throw new Error('Invalid API key. Check your AI provider keys.');
      if (err.status === 429 || err.response?.status === 429) throw new Error('AI rate limit hit. Please wait a moment and try again.');
      throw new Error('AI service temporarily unavailable. Please try again later.');
    }
  }

  /**
   * Match prediction — uses OpenRouter (Claude) for sharper reasoning.
   */
  async predictMatch(homeTeam, awayTeam, contextData = null) {
    this._assertConfigured();
    const cacheKey = `ai:predict:${homeTeam.toLowerCase()}:${awayTeam.toLowerCase()}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const prompt = contextData
        ? `Predict the outcome of **${homeTeam} vs ${awayTeam}**.\n\nAPI Data: ${JSON.stringify(contextData)}\n\nProvide: win probabilities for each outcome, most likely scoreline, key factors that will decide the match, and your final prediction. Be specific and analytical.`
        : `Predict the outcome of **${homeTeam} vs ${awayTeam}**. Based on your football knowledge, provide win probabilities, the most likely scoreline, 3 key deciding factors, and your confident final prediction.`;

      const result = await this._qualityChat(
        [{ role: 'system', content: getSystemPrompt() }, { role: 'user', content: prompt }],
        900, 0.6
      );
      await this.cache.set(cacheKey, result, 3600);
      return result;
    } catch (err) {
      logger.error('[AiService] predictMatch() error:', err.message);
      throw new Error('Could not generate prediction. Please try again.');
    }
  }

  /**
   * Player analysis — uses OpenRouter for depth.
   */
  async analyzePlayer(playerName, statsData = null) {
    this._assertConfigured();
    try {
      const prompt = statsData
        ? `Analyze the football player **${playerName}** based on these statistics: ${JSON.stringify(statsData)}.\n\nCover: overall assessment, key strengths, main weaknesses, playing style, impact on their team, and potential.`
        : `Provide a thorough analysis of the football player **${playerName}**. Cover their career highlights, playing style, strengths, weaknesses, best positions, and overall significance to football.`;

      return await this._qualityChat(
        [{ role: 'system', content: getSystemPrompt() }, { role: 'user', content: prompt }],
        1000, 0.65
      );
    } catch (err) {
      logger.error('[AiService] analyzePlayer() error:', err.message);
      throw new Error('Could not analyze player. Please try again.');
    }
  }

  /**
   * Team analysis — uses OpenRouter for depth.
   */
  async analyzeTeam(teamName, statsData = null) {
    this._assertConfigured();
    try {
      const prompt = statsData
        ? `Analyze the football club **${teamName}** using this data: ${JSON.stringify(statsData)}.\n\nCover: tactical setup, current form, key players, strengths, weaknesses, and season outlook.`
        : `Provide a comprehensive analysis of **${teamName}**. Cover: history and achievements, current squad strengths, tactical approach, key players, weaknesses, and expectations for the current season.`;

      return await this._qualityChat(
        [{ role: 'system', content: getSystemPrompt() }, { role: 'user', content: prompt }],
        1000, 0.65
      );
    } catch (err) {
      logger.error('[AiService] analyzeTeam() error:', err.message);
      throw new Error('Could not analyze team. Please try again.');
    }
  }

  /**
   * Explain a football concept — uses Groq (fast, cached 24h).
   */
  async explain(topic) {
    this._assertConfigured();
    const cacheKey = `ai:explain:${topic.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const result = await this._groqChat(
        [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: `Explain this football concept clearly and engagingly: "${topic}".\n\nMake it understandable for both beginners and experienced fans. Use examples where helpful.` },
        ],
        700, 0.5
      ).catch(() => this._orChat(
        [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: `Explain this football concept clearly and engagingly: "${topic}". Use examples where helpful.` },
        ],
        700, 0.5
      ));

      await this.cache.set(cacheKey, result, 86400);
      return result;
    } catch (err) {
      logger.error('[AiService] explain() error:', err.message);
      throw new Error('Could not generate explanation. Please try again.');
    }
  }

  /**
   * Form guide — uses OpenRouter for nuanced narrative.
   */
  async formGuide(teamName, recentResults) {
    this._assertConfigured();
    try {
      const summary = recentResults.map((r) =>
        `${r.result} vs ${r.opponent} (${r.scoreFor}-${r.scoreAgainst})`
      ).join(', ');

      return await this._qualityChat(
        [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: `${teamName}'s last ${recentResults.length} results: ${summary}.\n\nExplain what this form tells us in 2-3 short paragraphs — momentum, patterns (high-scoring? defensively solid? inconsistent?), and what it suggests for their next match. Plain English, no jargon dump.` },
        ],
        450, 0.6
      );
    } catch (err) {
      logger.error('[AiService] formGuide() error:', err.message);
      throw new Error('Could not generate form guide. Please try again.');
    }
  }

  /**
   * Key players to watch — uses OpenRouter.
   */
  async keyPlayers(homeTeam, awayTeam, homePlayers, awayPlayers) {
    this._assertConfigured();
    try {
      return await this._qualityChat(
        [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: `Match: ${homeTeam} vs ${awayTeam}.\n\n${homeTeam} lineup: ${homePlayers.join(', ')}\n${awayTeam} lineup: ${awayPlayers.join(', ')}\n\nPick exactly 3 key players to watch (mix of both teams) and explain in 1-2 sentences each why they could decide this match. Format as a short numbered list.` },
        ],
        550, 0.65
      );
    } catch (err) {
      logger.error('[AiService] keyPlayers() error:', err.message);
      throw new Error('Could not identify key players. Please try again.');
    }
  }

  /**
   * Partner-only: AI betting tip for a match.
   */
  async bettingTip(homeTeam, awayTeam, league = '') {
    this._assertConfigured();
    const cacheKey = `ai:protip:${homeTeam.toLowerCase()}:${awayTeam.toLowerCase()}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const result = await this._qualityChat(
        [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: `Match: ${homeTeam} vs ${awayTeam}${league ? ` (${league})` : ''}.

Give one concise, data-driven betting tip. Include: best value bet (match winner, btts, or over/under), reasoning in 2-3 sentences, and a confidence level (Low/Medium/High). Keep it responsible — for entertainment only.` },
        ],
        500, 0.6
      );
      await this.cache.set(cacheKey, result, 3600);
      return result;
    } catch (err) {
      logger.error('[AiService] bettingTip() error:', err.message);
      throw new Error('Could not generate betting tip. Please try again.');
    }
  }

  /**
   * Partner-only: deep-dive tactical analysis of a match.
   */
  async deepDive(homeTeam, awayTeam, league = '', focus = 'all') {
    this._assertConfigured();
    const cacheKey = `ai:deepdive:${homeTeam.toLowerCase()}:${awayTeam.toLowerCase()}:${focus}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const focusText = {
      tactics: 'Focus ONLY on tactics: formations, pressing, build-up patterns, key battles, and expected approach.',
      form: 'Focus ONLY on recent form: momentum, scoring patterns, defensive record, and what the last 5 matches suggest.',
      h2h: 'Focus ONLY on head-to-head history: recent meetings, trends, and psychological edge.',
      all: 'Cover tactics, recent form, and head-to-head history in a balanced analysis.',
    }[focus] || 'Cover tactics, recent form, and head-to-head history in a balanced analysis.';

    try {
      const result = await this._qualityChat(
        [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: `Deep-dive tactical analysis of **${homeTeam} vs ${awayTeam}**${league ? ` in ${league}` : ''}.

${focusText}

Write 3-4 short paragraphs. Be specific, use real football knowledge, and avoid generic statements.` },
        ],
        900, 0.6
      );
      await this.cache.set(cacheKey, result, 3600);
      return result;
    } catch (err) {
      logger.error('[AiService] deepDive() error:', err.message);
      throw new Error('Could not generate deep dive. Please try again.');
    }
  }

  /**
   * Match recap — uses OpenRouter for narrative quality.
   */
  async matchRecap(homeTeam, awayTeam, finalScore, events) {
    this._assertConfigured();
    try {
      const eventSummary = events.map((e) => `${e.minute}' ${e.type}: ${e.player} (${e.team})`).join('\n');

      return await this._qualityChat(
        [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: `Write a short, engaging match recap (3-4 sentences) for ${homeTeam} ${finalScore} ${awayTeam}.\n\nKey events:\n${eventSummary || 'No major events recorded.'}\n\nMake it read like a real sports recap — flowing narrative prose, not a bullet list.` },
        ],
        550, 0.7
      );
    } catch (err) {
      logger.error('[AiService] matchRecap() error:', err.message);
      throw new Error('Could not generate match recap. Please try again.');
    }
  }

  /**
   * Player bio — uses Groq (fast, cached 24h).
   */
  async playerBio(playerName, profileData = null) {
    this._assertConfigured();
    const cacheKey = `ai:bio:${playerName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const prompt = profileData
        ? `Write a short, engaging biography (3-4 sentences) of footballer ${playerName}. Use ONLY the following data as the source of truth for current club, nationality, age, position, and season stats. If the data contradicts your training data, trust the data. Data: ${JSON.stringify(profileData)}.`
        : `Write a short, engaging biography (3-4 sentences) of footballer ${playerName}. Cover their career highlights and what makes them notable. If asked about current club or transfer status, say you don't have live data unless context is provided.`;

      const result = await this._groqChat(
        [{ role: 'system', content: getSystemPrompt() }, { role: 'user', content: prompt }],
        400, 0.65
      ).catch(() => this._orChat(
        [{ role: 'system', content: getSystemPrompt() }, { role: 'user', content: prompt }],
        400, 0.65
      ));

      await this.cache.set(cacheKey, result, 86400);
      return result;
    } catch (err) {
      logger.error('[AiService] playerBio() error:', err.message);
      throw new Error('Could not generate player bio. Please try again.');
    }
  }

  /**
   * Fan chants — uses Groq (creative, fast, cached 24h).
   */
  async teamChants(teamName) {
    this._assertConfigured();
    const cacheKey = `ai:chants:${teamName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const result = await this._groqChat(
        [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: `Write 2 short, fun, original fan chants for ${teamName} supporters to sing at matches. Keep them upbeat, rhythmic, and safe for all audiences. Label them "Chant 1" and "Chant 2".` },
        ],
        350, 0.9
      ).catch(() => this._orChat(
        [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: `Write 2 short, fun, original fan chants for ${teamName} supporters. Label them "Chant 1" and "Chant 2".` },
        ],
        350, 0.9
      ));

      await this.cache.set(cacheKey, result, 86400);
      return result;
    } catch (err) {
      logger.error('[AiService] teamChants() error:', err.message);
      throw new Error('Could not generate chants. Please try again.');
    }
  }

  /**
   * Deep player scouting report — partner exclusive.
   * Uses OpenRouter for depth and quality.
   */
  async scoutPlayer(playerName) {
    this._assertConfigured();
    const cacheKey = `ai:scout:${playerName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const result = await this._qualityChat(
        [
          { role: 'system', content: getSystemPrompt() },
          {
            role: 'user',
            content: `Generate a detailed scouting report for **${playerName}** as if you are a top football scout.\n\nStructure it as:\n1. **Profile** — age, position, club, nationality\n2. **Key Strengths** — 3 specific strengths with brief explanations\n3. **Weaknesses** — 2 areas of improvement\n4. **Playing Style** — how they operate in 2-3 sentences\n5. **Potential** — ceiling, trajectory, future value\n6. **Scout Verdict** — one sentence summary rating (Poor/Average/Good/Excellent/World Class)\n\nBe specific, analytical, and honest. Use real data you know.`,
          },
        ],
        1200, 0.6
      );
      await this.cache.set(cacheKey, result, 43200); // 12h cache
      return result;
    } catch (err) {
      logger.error('[AiService] scoutPlayer() error:', err.message);
      throw new Error('Could not generate scouting report. Please try again.');
    }
  }

  /**
   * Tactical breakdown of a team — partner exclusive.
   * Uses OpenRouter for depth.
   */
  async tacticalBreakdown(teamName) {
    this._assertConfigured();
    const cacheKey = `ai:tactics:${teamName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const result = await this._qualityChat(
        [
          { role: 'system', content: getSystemPrompt() },
          {
            role: 'user',
            content: `Provide a full tactical breakdown of **${teamName}** as a professional analyst.\n\nCover:\n1. **Formation** — primary shape and variations\n2. **Pressing Style** — high press, mid-block, or low block?\n3. **Build-up Play** — how they progress from defense to attack\n4. **Attacking Patterns** — key movements and combinations in the final third\n5. **Set Pieces** — corners, free kicks approach\n6. **Defensive Shape** — how they defend without the ball\n7. **Weaknesses to Exploit** — tactical vulnerabilities an opponent should target\n\nBe specific and tactical — this is for a serious football analyst.`,
          },
        ],
        1300, 0.6
      );
      await this.cache.set(cacheKey, result, 43200); // 12h cache
      return result;
    } catch (err) {
      logger.error('[AiService] tacticalBreakdown() error:', err.message);
      throw new Error('Could not generate tactical breakdown. Please try again.');
    }
  }

  /**
   * Full pre-match preview — partner exclusive.
   * Uses OpenRouter for quality reasoning.
   */
  async matchPreview(homeTeam, awayTeam) {
    this._assertConfigured();
    const cacheKey = `ai:preview:${homeTeam.toLowerCase().replace(/\s/g, '')}:${awayTeam.toLowerCase().replace(/\s/g, '')}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const result = await this._qualityChat(
        [
          { role: 'system', content: getSystemPrompt() },
          {
            role: 'user',
            content: `Write a full pre-match preview for **${homeTeam} vs ${awayTeam}**.\n\nInclude:\n1. **Team News** — likely lineups and key absences\n2. **Form Guide** — recent results for each side (last 5)\n3. **Head-to-Head** — notable history between these clubs\n4. **Key Battle** — one specific matchup that could decide the game\n5. **Tactical Preview** — how each team is likely to set up\n6. **Predicted Score** — your score prediction with brief reasoning\n7. **One to Watch** — one player from each team to watch\n\nWrite as a professional football journalist. Be specific and engaging.`,
          },
        ],
        1400, 0.65
      );
      await this.cache.set(cacheKey, result, 7200); // 2h cache
      return result;
    } catch (err) {
      logger.error('[AiService] matchPreview() error:', err.message);
      throw new Error('Could not generate match preview. Please try again.');
    }
  }

  /** Clears conversation history for a user. */
  clearHistory(userId) {
    this.conversationHistory.delete(userId);
    logger.debug(`[AiService] Cleared history for user ${userId}`);
  }

  /** Returns the number of messages in a user's history. */
  getHistoryLength(userId) {
    return this.conversationHistory.get(userId)?.length || 0;
  }

  /** Returns a summary of which providers are active (for /models). */
  getProviderStatus() {
    return {
      groq: {
        configured: this.groqConfigured,
        model: this.groqModel,
        role: 'Speed — chat, explain, bios, chants',
      },
      openRouter: {
        configured: this.orConfigured,
        model: this.orModel,
        role: 'Quality — analysis, predictions, recaps, form guides',
      },
    };
  }
}

module.exports = { AiService };
