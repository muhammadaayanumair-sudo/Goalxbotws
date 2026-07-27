'use strict';

const mongoose = require('mongoose');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const Guild = require('../models/Guild');
const { NewsService } = require('../services/news/NewsService');
const { NewsPipelineEngine } = require('../services/news/NewsPipelineEngine');
const { logger } = require('../utils/logger');
const { resolvePostableChannel, sendSafely } = require('./channelDelivery');

// Shared dedup model
const postedNewsSchema = new mongoose.Schema(
  { url: { type: String, required: true, unique: true, index: true } },
  { timestamps: true }
);
postedNewsSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 86400 });
const PostedNews = mongoose.models.PostedNews || mongoose.model('PostedNews', postedNewsSchema);

const FOOTBALL_KEYWORDS = [
  'football', 'soccer', 'premier league', 'la liga', 'bundesliga', 'serie a',
  'ligue 1', 'champions league', 'europa league', 'fifa', 'uefa', 'world cup',
  'eredivisie', 'mls', 'transfer', 'signing', 'match', 'goal', 'striker',
  'midfielder', 'defender', 'goalkeeper', 'manager', 'club', 'squad', 'fixture',
  'standings', 'bundesliga', 'fa cup', 'copa del rey', 'dfb-pokal',
];

function isFootballArticle(article) {
  const text = `${article.title} ${article.description || ''}`.toLowerCase();
  return FOOTBALL_KEYWORDS.some((kw) => text.includes(kw));
}

/** Clamps text, adding ellipsis when cut */
function clamp(str, max) {
  if (!str) return str;
  const s = String(str);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * NewsScheduler — posts latest football-only news with premium embeds.
 * Every article gets a bold card, a "Read Article" button, and a clean layout.
 */
class NewsScheduler {
  constructor(client) {
    this.client = client;
  }

  async run() {
    const guilds = await Guild.find({
      'channels.news.enabled':   true,
      'channels.news.channelId': { $ne: null },
    }).lean();

    if (!guilds.length) return;

    const newsService = new NewsService(this.client.cache);
    const pipeline = new NewsPipelineEngine(this.client.aiRouter, this.client.cache);

    let articles;
    try {
      articles = await newsService.getLatestNews(15);
    } catch (err) {
      logger.error('[NewsScheduler] Failed to fetch news:', err.message);
      return;
    }

    let processed = [];
    try {
      processed = await pipeline.process(articles, { query: 'football breaking news', limit: 5 });
    } catch (err) {
      logger.error('[NewsScheduler] Pipeline failed:', err.message);
      // Fallback to legacy keyword filter
      processed = articles.filter(isFootballArticle).slice(0, 5).map((a) => ({ ...a, formattedHeadline: a.title, formattedBody: a.description || '' }));
    }

    if (!processed.length) {
      logger.info('[NewsScheduler] No verified football articles to post.');
      return;
    }

    // MongoDB dedup
    const urls = processed.map((a) => a.link);
    const alreadyPosted = await PostedNews.find({ url: { $in: urls } }).lean();
    const postedSet = new Set(alreadyPosted.map((p) => p.url));

    const fresh = processed.filter((a) => !postedSet.has(a.link));
    if (!fresh.length) {
      logger.info('[NewsScheduler] No new verified football articles to post.');
      return;
    }

    // Persist before posting
    try {
      await PostedNews.insertMany(fresh.map((a) => ({ url: a.link })), { ordered: false });
    } catch (err) {
      logger.debug('[NewsScheduler] Some URLs already persisted (race):', err.message);
    }

    let postedCount = 0;

    for (const guildConfig of guilds) {
      const channel = await resolvePostableChannel(
        this.client, guildConfig.channels.news.channelId, guildConfig.guildId, 'NewsScheduler'
      );
      if (!channel) continue;

      for (const article of fresh.slice(0, 2)) {
        const embed = this._buildArticleEmbed(article);
        const row = this._buildButtonRow(article.link);

        const ok = await sendSafely(
          channel,
          { embeds: [embed], components: [row] },
          guildConfig.guildId,
          'NewsScheduler'
        );
        if (ok) postedCount++;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    logger.info(`[NewsScheduler] Posted ${postedCount} verified football article(s) across ${guilds.length} guild(s).`);
  }

  _buildArticleEmbed(article) {
    const embed = new EmbedBuilder()
      .setColor('#E74C3C') // Bold GoalX red
      .setTitle(clamp(article.formattedHeadline || article.title, 250))
      .setDescription(clamp(article.formattedBody || article.description || '', 380))
      .setURL(article.link)
      .setTimestamp(article.publishedAt)
      .setAuthor({ name: article.source || 'News Source', iconURL: 'https://cdn.discordapp.com/emojis/1270000000000000000.webp' })
      .setFooter({ text: `⚽ GoalX · Verified Football News · Updated every 15 min` });

    if (article.imageUrl) embed.setImage(article.imageUrl);

    return embed;
  }

  _buildButtonRow(url) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('📰 Read Full Article')
        .setStyle(ButtonStyle.Link)
        .setURL(url)
    );
  }
}

module.exports = { NewsScheduler };
