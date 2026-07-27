'use strict';

const { logger } = require('../utils/logger');

// Truly required — bot cannot boot at all without these
const REQUIRED_VARS = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
];

// Recommended — bot boots fine, but specific features silently degrade
const RECOMMENDED = [
  { key: 'API_FOOTBALL_KEY', feature: 'live scores, fixtures, standings, players (primary source)' },
  { key: 'FOOTBALL_DATA_KEY', feature: 'football data fallback if API-Football is rate limited' },
  { key: 'GROQ_API_KEY', feature: '/ask, /analyze, /predictions, /explain (AI commands)' },
  { key: 'NEWS_API_KEY', feature: '/news, /transfernews' },
  { key: 'SESSION_SECRET', feature: 'dashboard login sessions' },
  { key: 'BOT_OWNER_ID', feature: '/admin, /broadcast (owner-only commands)' },
  // Extended AI provider stack
  { key: 'CLOUD_CEREBRAS_API_KEY', feature: 'Cerebras LPU — ultra-fast live match chat routing' },
  { key: 'SABANOVA_API_KEY', feature: 'SambaNova RDU — bulk stats processing & heavy analytics' },
  { key: 'GLM_API', feature: 'Z.ai GLM-5 — diagnostic reasoning lane (/fixerror dual-engine)' },
  { key: 'GITHUB_MODELS_TOKEN', feature: 'GitHub Models GPT-4.1 — patch generation (/fixerror dual-engine)' },
  { key: 'SILICON_FLOW_API', feature: 'SiliconFlow — open-weights chat gateway (Qwen, DeepSeek, Llama)' },
  { key: 'xAi_API_KEY', feature: 'xAI Grok — real-time reasoning and social sentiment radar' },
  { key: 'HUGGINGFACE_API_KEY', feature: 'Hugging Face — zero-shot classification and NLP tasks' },
  { key: 'EXA_API_KEY', feature: 'Exa — neural semantic web search for grounded football data' },
  { key: 'COHERE_API_KEY', feature: 'Cohere — rerank search results and incoming news' },
  // Self-healing pipeline
  { key: 'GITHUB_REPO_TOKEN', feature: 'auto-push patched files to GitHub on /fixerror' },
];

/**
 * Checks whether a MongoDB connection string is available from any
 * supported source: Railway's auto-injected MONGODB_URL, a manual
 * MONGODB_URI, or falls back to localhost for local dev.
 */
function hasDatabaseUri() {
  return Boolean(process.env.MONGODB_URL || process.env.MONGODB_URI);
}

/**
 * Validates environment configuration on boot.
 * - Throws only for genuinely fatal missing values (Discord credentials).
 * - Warns loudly but continues for everything else, listing exactly
 *   which slash commands will be degraded so nothing fails silently.
 */
function validateEnvironment() {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    throw new Error(
      `[EnvValidation] Missing required environment variables: ${missing.join(', ')}\n` +
      `  → Get DISCORD_TOKEN and DISCORD_CLIENT_ID from https://discord.com/developers/applications`
    );
  }

  if (!hasDatabaseUri()) {
    throw new Error(
      '[EnvValidation] Missing required database configuration: set MONGODB_URI (or MONGODB_URL).\n' +
      '  → Bot requires MongoDB. Add your connection string as a secret named MONGODB_URI.'
    );
  }

  const missingRecommended = RECOMMENDED.filter((v) => !process.env[v.key]);

  if (missingRecommended.length > 0) {
    logger.warn('[EnvValidation] Some optional features are not configured:');
    for (const { key, feature } of missingRecommended) {
      logger.warn(`  ⚠️  ${key} not set → affects: ${feature}`);
    }
    logger.warn('[EnvValidation] Bot will still start. Add these keys anytime to enable the features above.');
  } else {
    logger.info('[EnvValidation] All recommended environment variables are set ✅');
  }
}

module.exports = { validateEnvironment, hasDatabaseUri };