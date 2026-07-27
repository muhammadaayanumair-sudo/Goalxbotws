'use strict';

/**
 * Central configuration object for GoalX.
 * All values are read from environment variables with safe defaults.
 */
const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    testGuildId: process.env.DISCORD_TEST_GUILD_ID,
    ownerId: process.env.BOT_OWNER_ID,
  },

  apis: {
    apiFootball: {
      key: process.env.API_FOOTBALL_KEY,
      // Support both api-sports.io direct and RapidAPI fallback
      host: process.env.API_FOOTBALL_HOST || 'v3.football.api-sports.io',
      baseUrl: process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io',
      rateLimit: 100, // per minute free tier
    },
    footballData: {
      key: process.env.FOOTBALL_DATA_KEY,
      baseUrl: process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4',
      rateLimit: 10, // per minute free tier
    },
  },

  database: {
    // Railway auto-injects MONGODB_URL when you add the MongoDB plugin.
    // Falls back to MONGODB_URI for manual setups, then localhost for dev.
    uri:
      process.env.MONGODB_URL ||
      process.env.MONGODB_URI ||
      'mongodb://localhost:27017/goalx',
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    },
  },

  // Redis removed — using in-memory cache (no Redis needed on Railway)

  ai: {
    // Groq — ultra-fast LPU inference, used for conversational / quick tasks
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    maxTokens: parseInt(process.env.GROQ_MAX_TOKENS) || 1024,

    // OpenRouter — routes to best available model (Claude, GPT-4o, Gemini, etc.)
    // Used for deep analysis tasks where quality > speed
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    openRouterModel: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
    openRouterBaseUrl: 'https://openrouter.ai/api/v1',

    // Cerebras — ultra-fast LPU Cloud API for live match chats & real-time streaming
    cerebrasApiKey: process.env.CLOUD_CEREBRAS_API_KEY,
    cerebrasModel: process.env.CEREBRAS_MODEL || 'llama-4-scout-17b-16e-instruct',

    // SambaNova — high-throughput RDU for bulk stats processing & large-scale ingestion
    sambanovaApiKey: process.env.SABANOVA_API_KEY,
    sambanovaModel: process.env.SAMBANOVA_MODEL || 'Meta-Llama-3.3-70B-Instruct',

    // Z.ai GLM — diagnostic & reasoning lane (code auditing, AST validation)
    glmApiKey: process.env.GLM_API,
    glmModel: process.env.GLM_MODEL || 'glm-4-air',

    // GitHub Models — GPT-4.1/GPT-5 diagnostic lane (patch generation, code review)
    githubModelsToken: process.env.GITHUB_MODELS_TOKEN,
    githubModelsModel: process.env.GITHUB_MODELS_MODEL || 'gpt-4.1',

    // Ollama — local air-gapped fallback, zero-cost offline dev
    ollamaApiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',

    // SiliconFlow — open-weights model gateway (Qwen, DeepSeek, Llama)
    siliconFlowApiKey: process.env.SILICON_FLOW_API,
    siliconFlowModel: process.env.SILICON_FLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
    siliconFlowBaseUrl: process.env.SILICON_FLOW_BASE_URL || 'https://api.siliconflow.cn/v1',

    // xAI Grok — real-time reasoning and social sentiment analysis
    xaiApiKey: process.env.xAi_API_KEY,
    xaiModel: process.env.XAI_MODEL || 'grok-2-latest',
    xaiBaseUrl: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',

    // Hugging Face — zero-shot classification and lightweight NLP tasks
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    huggingfaceModel: process.env.HUGGINGFACE_MODEL || 'facebook/bart-large-mnli',

    // Exa — neural semantic web search for grounding football data
    exaApiKey: process.env.EXA_API_KEY,
    exaBaseUrl: process.env.EXA_BASE_URL || 'https://api.exa.ai',

    // Cohere — rerank search results and news articles
    cohereApiKey: process.env.COHERE_API_KEY,
    cohereBaseUrl: process.env.COHERE_BASE_URL || 'https://api.cohere.com/v1',
    cohereRerankModel: process.env.COHERE_RERANK_MODEL || 'rerank-english-v3.0',
  },

  // Self-healing pipeline
  selfHealing: {
    githubRepoToken: process.env.GITHUB_REPO_TOKEN,
    githubRepoOwner: process.env.GITHUB_REPO_OWNER,
    githubRepoName: process.env.GITHUB_REPO_NAME,
    githubRepoBranch: process.env.GITHUB_REPO_BRANCH || 'main',
    maxCapturedErrors: parseInt(process.env.MAX_CAPTURED_ERRORS) || 50,
  },

  // Cloudflare Workers AI (edge cron & health checks)
  cloudflare: {
    apiKey: process.env.CLOUDFLARE_API_KEY,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  },

  news: {
    // NewsAPI.org — free tier: 100 requests/day
    // Get your key at: https://newsapi.org/register
    apiKey: process.env.NEWS_API_KEY,
    baseUrl: 'https://newsapi.org/v2',
  },

  dashboard: {
    port: parseInt(process.env.DASHBOARD_PORT) || 3000,
    url: process.env.DASHBOARD_URL || 'http://localhost:3000',
    sessionSecret: process.env.SESSION_SECRET,
    redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/auth/discord/callback',
    cookieDomain: process.env.COOKIE_DOMAIN || 'localhost',
  },

  economy: {
    startingCoins: parseInt(process.env.STARTING_COINS) || 500,
    dailyCoins: parseInt(process.env.DAILY_COINS) || 200,
    weeklyCoins: parseInt(process.env.WEEKLY_COINS) || 1000,
    workCoinsMin: parseInt(process.env.WORK_COINS_MIN) || 50,
    workCoinsMax: parseInt(process.env.WORK_COINS_MAX) || 150,
    dailyCooldown: 86400000,   // 24 hours
    weeklyCooldown: 604800000, // 7 days
    workCooldown: 3600000,     // 1 hour
  },

  cards: {
    packPrices: {
      basic: parseInt(process.env.PACK_PRICE_BASIC) || 500,
      premium: parseInt(process.env.PACK_PRICE_PREMIUM) || 1500,
      elite: parseInt(process.env.PACK_PRICE_ELITE) || 5000,
      vip: parseInt(process.env.PACK_PRICE_VIP) || 8000,
    },
    cardsPerPack: {
      basic: 3,
      premium: 5,
      elite: 7,
      vip: 10,
    },
    rarityWeights: {
      basic: { common: 70, rare: 22, epic: 7, legendary: 1 },
      premium: { common: 45, rare: 35, epic: 15, legendary: 5 },
      elite: { common: 20, rare: 35, epic: 30, legendary: 15 },
      vip: { common: 0, rare: 10, epic: 45, legendary: 35, limited: 10 },
    },
  },

  betting: {
    minBet: parseInt(process.env.MIN_BET) || 50,
    maxBet: parseInt(process.env.MAX_BET) || 10000,
    houseEdge: 0.05, // 5%
  },

  cache: {
    ttl: {
      live: 30,          // 30 seconds
      fixtures: 300,     // 5 minutes
      standings: 3600,   // 1 hour
      player: 3600,      // 1 hour
      team: 3600,        // 1 hour
      news: 900,         // 15 minutes
      transfers: 1800,   // 30 minutes
    },
  },

  scheduler: {
    liveScoreInterval: '*/1 * * * *',   // Every minute
    fixtureInterval: '0 */6 * * *',     // Every 6 hours
    newsInterval: '*/15 * * * *',       // Every 15 minutes
    transferInterval: '0 */2 * * *',    // Every 2 hours
    fabrizioRomanoInterval: '0 */4 * * *', // Every 4 hours
    standingsInterval: '0 * * * *',     // Every hour
    cleanupInterval: '0 2 * * *',       // Daily at 2am
  },

  bot: {
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    shardCount: process.env.SHARD_COUNT || 'auto',
    defaultPrefix: '/',
    embedColor: '#00D4FF',
    errorColor: '#FF4444',
    successColor: '#44FF88',
    warningColor: '#FFB344',
  },

  premium: {
    guildLimit: parseInt(process.env.PREMIUM_GUILD_LIMIT) || 5,
  },

  webhooks: {
    error: process.env.ERROR_WEBHOOK_URL,
    log: process.env.LOG_WEBHOOK_URL,
  },
};

module.exports = config;
