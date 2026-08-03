'use strict';

const { logger } = require('../../utils/logger');
const { detectClubColors } = require('./clubColors');

/**
 * NewsPipelineEngine — verified, Fabrizio-style news filter and formatter.
 *
 * Pipeline stages:
 *   1. Hard rejection (keywords + source filter)
 *   2. HuggingFace zero-shot classification (football vs non-football)
 *   3. Exa semantic verification (trusted football sources)
 *   4. Cohere relevance reranking
 *   5. Fabrizio-style formatting (headline + body + call to action)
 *
 * Every stage is guarded by config; missing keys degrade gracefully.
 */
class NewsPipelineEngine {
  constructor(aiRouter, cache) {
    this.aiRouter = aiRouter;
    this.cache = cache;

    this.rejectionKeywords = [
      // American football
      'nfl', 'nfl draft', 'nfl news', 'american football', 'gridiron',
      'super bowl', 'quarterback', 'touchdown', 'touchdowns', 'ncaa',
      'college football', 'national football league', 'nfc', 'afc',
      'nfl playoffs', 'nfl combine', 'pro bowl', 'field goal', 'punter',
      'wide receiver', 'linebacker', 'nfl team', 'nfl player',
      // Rugby
      'rugby', 'rugby league', 'rugby union', 'six nations', 'super rugby',
      'rugby world cup', 'try line', 'tries', 'scrum', 'lineout', 'all blacks',
      'springboks', 'wallabies', 'premiership rugby', 'top 14', 'rugby sevens',
      // Other sports
      'nba', 'cricket', 'tennis', 'formula 1', 'f1', 'esports', 'ufc', 'mma',
      'baseball', 'hockey', 'golf', 'olympics', 'basketball',
      'world series', 'march madness',
      'home run', 'nhl', 'mlb', 'nascar', 'pga tour', 'stanley cup', 'wnba',
      'nba draft', 'american', 'boxing', 'wrestling', 'wwe', 'badminton',
      'volleyball', 'snooker', 'darts', 'cycling', 'motogp', 'horse racing',
      'athletics', 'swimming', 'gymnastics',
      // Non-sport / off-topic
      'movie', 'movies', 'film', 'actor', 'actress', 'celebrity', 'celebrities',
      'music', 'album', 'song', 'concert', 'award show', 'grammy', 'oscar',
      'politics', 'election', 'government', 'president', 'minister', 'war',
      'geopolitical', 'economy', 'crypto', 'bitcoin', 'stock market',
      'tiktok', 'viral', 'influencer', 'onlyfans', 'fashion', 'lifestyle',
    ];

    this.acceptanceKeywords = [
      'football', 'soccer', 'premier league', 'la liga', 'serie a', 'bundesliga',
      'ligue 1', 'champions league', 'europa league', 'conference league',
      'world cup', 'euros', 'euro 2024', 'euro 2028', 'copa america', 'uefa', 'fifa',
      'concacaf', 'afcon', 'caf champions league', 'mls', 'eredivisie',
      'primeira liga', 'scottish premiership', 'championship',
      'transfer', 'signing', 'contract extension', 'loan move', 'medical',
      'done deal', 'here we go', 'release clause', 'buy-out clause',
      'football manager', 'football club', 'football coach', 'sacked as manager',
      'appointed manager', 'starting lineup', 'football fixture', 'kickoff',
      'football match', 'football goal', 'penalty kick', 'var decision',
      'referee decision', 'league table', 'points table', 'clean sheet',
      'hat-trick', 'assist', 'striker', 'midfielder', 'winger', 'centre-back',
      'goalkeeper', 'football club', 'football stadium', 'football derby',
    ];

    this.trustedDomains = new Set([
      'espn.com', 'espn.co.uk', 'bbc.com', 'bbcsport.com', 'bbc.co.uk/sport',
      'espnfc.com', 'goal.com', 'transfermarkt.com', 'transfermarkt.it',
      'skysports.com', 'espn.com/soccer', 'espn.co.uk/football',
      'espn.in', 'espn.com.au', 'espn.com.br', 'espn.mx',
      'goal.com', 'onefootball.com', 'fotmob.com', 'flashscore.com',
      'espnfc.us', 'espnfc.com', 'espn.com', 'espn.co.uk',
      '90min.com', 'caughtoffside.com', 'football365.com', 'football.london',
      'espn.com', 'espn.com', 'espn.com',
    ]);
  }

  // ── Stage 1: Hard rejection ─────────────────────────────────────────────────

  hardReject(article) {
    const text = `${article.title} ${article.description || ''} ${article.source || ''}`.toLowerCase();

    for (const kw of this.rejectionKeywords) {
      if (text.includes(kw)) {
        logger.debug(`[NewsPipeline] Hard rejected by keyword "${kw}": ${article.title}`);
        return false;
      }
    }

    const hasFootballSignal = this.acceptanceKeywords.some((kw) => text.includes(kw));
    if (!hasFootballSignal) {
      logger.debug(`[NewsPipeline] Hard rejected — no football signal found: ${article.title}`);
      return false;
    }

    return true;
  }

  // ── Stage 2: HuggingFace zero-shot classification ─────────────────────────

  async classify(article) {
    if (!this.aiRouter?.huggingface?.configured) return true;

    const text = `${article.title} ${article.description || ''}`.slice(0, 1000);
    const labels = [
      'football transfer or signing',
      'football match or competition',
      'other sports',
      'politics or world news',
      'entertainment or celebrity gossip',
    ];

    try {
      const result = await this.aiRouter.classify(text, labels);
      const topLabel = result.labels?.[0];
      const topScore = result.scores?.[0] ?? 0;
      const accepted = topLabel?.includes('football') && topScore > 0.55;
      logger.debug(
        `[NewsPipeline] HF classify "${article.title.slice(0, 60)}" → ${topLabel} (${topScore.toFixed(2)}) ${accepted ? 'PASS' : 'DROP'}`
      );
      return accepted;
    } catch (err) {
      logger.warn('[NewsPipeline] HF classification failed:', err.message);
      return true; // fail-open to avoid blocking all news
    }
  }

  // ── Stage 3: Exa semantic verification ────────────────────────────────────────

  async verify(article) {
    if (!this.aiRouter?.exa?.configured) return true;

    try {
      const query = `${article.title} ${article.description || ''}`.slice(0, 200);
      const results = await this.aiRouter.search(query, { numResults: 5, useAutoprompt: true });
      if (!results.length) {
        logger.debug(`[NewsPipeline] Exa found no corroboration for: ${article.title}`);
        return false;
      }

      const trustedHits = results.filter((r) => this._isTrustedDomain(r.url));
      const ok = trustedHits.length >= 1 || results.length >= 2;
      logger.debug(
        `[NewsPipeline] Exa verify "${article.title.slice(0, 60)}" → ${trustedHits.length} trusted / ${results.length} total ${ok ? 'PASS' : 'DROP'}`
      );
      return ok;
    } catch (err) {
      logger.warn('[NewsPipeline] Exa verification failed:', err.message);
      return true; // fail-open
    }
  }

  _isTrustedDomain(url) {
    if (!url) return false;
    try {
      const host = new URL(url).hostname.toLowerCase();
      return this.trustedDomains.has(host) || host.includes('espn') || host.includes('goal.com') || host.includes('transfermarkt') || host.includes('skysports') || host.includes('bbc.co.uk/sport') || host.includes('bbc.com/sport');
    } catch {
      return false;
    }
  }

  // ── Stage 4: Cohere relevance reranking ─────────────────────────────────────

  async rerank(articles, query) {
    if (!this.aiRouter?.cohere?.configured || articles.length === 0) return articles;

    const docs = articles.map((a) => `${a.title}. ${a.description || ''}`);
    try {
      const results = await this.aiRouter.rerank(query, docs, { topN: articles.length });
      const order = results.map((r) => r.index).filter((i) => i >= 0 && i < articles.length);
      logger.debug(`[NewsPipeline] Cohere reranked ${articles.length} articles for "${query}"`);
      return order.map((i) => articles[i]);
    } catch (err) {
      logger.warn('[NewsPipeline] Cohere rerank failed:', err.message);
      return articles;
    }
  }

  // ── Stage 5: Fabrizio-style formatting ──────────────────────────────────────

  format(article) {
    const { headline, prefix } = this._buildHeadline(article);
    const colors = detectClubColors(article.title);
    const fullHeadline = `${prefix} ${headline} ${colors}`.trim();

    const body = this._buildBody(article);

    return {
      ...article,
      formattedHeadline: fullHeadline,
      formattedBody: body,
    };
  }

  _buildHeadline(article) {
    const text = article.title.toLowerCase();
    let prefix = '🚨 BREAKING:';
    let headline = article.title;

    if (text.includes('here we go') || text.includes('done deal') || text.includes('agreed')) {
      prefix = '🚨 HERE WE GO!';
    } else if (text.includes('exclusive') || text.includes('excl:')) {
      prefix = '🚨 EXCLUSIVE:';
    } else if (text.includes('signed') || text.includes('contract') || text.includes('extension')) {
      prefix = '✍️ SIGNED:';
    } else if (text.includes('medical') || text.includes('completed') || text.includes('official')) {
      prefix = '🔴 COMPLETED:';
    }

    return { prefix, headline };
  }

  _buildBody(article) {
    const desc = (article.description || '').trim();
    if (!desc) return '';

    let paragraph = desc
      .replace(/(€[\d.,]+\s*(M|K|B)?)/gi, '**$1**')
      .replace(/(\$[\d.,]+\s*(M|K|B)?)/gi, '**$1**')
      .replace(/(\b\d+\s*(year|years|yr|yrs)\b)/gi, '**$1**');

    if (paragraph.length > 380) {
      paragraph = `${paragraph.slice(0, 379)}…`;
    }

    const lower = article.title.toLowerCase();
    let cta = 'Let us know your thoughts in the comments! ⚽';
    if (lower.includes('transfer') || lower.includes('signing')) {
      cta = 'Rate this signing from 1 to 10! 📝';
    } else if (lower.includes('match') || lower.includes('result') || lower.includes('lineup')) {
      cta = 'Predict the final score below! 🥅';
    } else if (lower.includes('contract') || lower.includes('extension')) {
      cta = 'Good move for the club? Yes or no? 💬';
    } else if (lower.includes('sack') || lower.includes('manager') || lower.includes('appointed')) {
      cta = 'Will this appointment work? Give us your take! 🧠';
    }

    return `${paragraph}\n\n${cta}`;
  }

  // ── Public pipeline ───────────────────────────────────────────────────────────

  async process(articles, { query = 'football breaking news', limit = 5 } = {}) {
    if (!Array.isArray(articles) || articles.length === 0) return [];

    let passed = articles.filter((a) => this.hardReject(a));
    logger.info(`[NewsPipeline] Stage 1 hard reject: ${articles.length} → ${passed.length}`);

    if (this.aiRouter?.huggingface?.configured) {
      const classified = await Promise.all(
        passed.map(async (a) => ({ a, ok: await this.classify(a) }))
      );
      passed = classified.filter((c) => c.ok).map((c) => c.a);
      logger.info(`[NewsPipeline] Stage 2 HF classify: ${classified.length} → ${passed.length}`);
    }

    if (this.aiRouter?.exa?.configured) {
      const verified = await Promise.all(
        passed.map(async (a) => ({ a, ok: await this.verify(a) }))
      );
      passed = verified.filter((v) => v.ok).map((v) => v.a);
      logger.info(`[NewsPipeline] Stage 3 Exa verify: ${verified.length} → ${passed.length}`);
    }

    passed = await this.rerank(passed, query);
    logger.info(`[NewsPipeline] Stage 4 Cohere rerank: ${passed.length} articles ordered`);

    const formatted = passed.slice(0, limit).map((a) => this.format(a));
    return formatted;
  }
}

module.exports = { NewsPipelineEngine };
