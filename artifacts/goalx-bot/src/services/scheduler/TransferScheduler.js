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
const { truncate } = require('../utils/formatters');
const { logger } = require('../utils/logger');
const { resolvePostableChannel, sendSafely } = require('./channelDelivery');

// Shared dedup model
const PostedNews = mongoose.models.PostedNews || mongoose.model('PostedNews', new mongoose.Schema(
  { url: { type: String, required: true, unique: true, index: true } },
  { timestamps: true }
));

function clamp(str, max) {
  if (!str) return str;
  const s = String(str);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * TransferScheduler — posts transfer rumours with premium embeds.
 */
class TransferScheduler {
  constructor(client) {
    this.client = client;
  }

  async run() {
    const guilds = await Guild.find({
      'channels.transfers.enabled':   true,
      'channels.transfers.channelId': { $ne: null },
    }).lean();

    if (!guilds.length) return;

    const newsService = new NewsService(this.client.cache);
    const pipeline = new NewsPipelineEngine(this.client.aiRouter, this.client.cache);

    let articles;
    try {
      articles = await newsService.getTransferNews(10);
    } catch (err) {
      logger.error('[TransferScheduler] Failed to fetch transfer news:', err.message);
      return;
    }

    let processed = [];
    try {
      processed = await pipeline.process(articles, { query: 'football transfer signing done deal', limit: 5 });
    } catch (err) {
      logger.error('[TransferScheduler] Pipeline failed:', err.message);
      processed = articles.slice(0, 5).map((a) => ({ ...a, formattedHeadline: a.title, formattedBody: a.description || '' }));
    }

    if (!processed.length) {
      logger.info('[TransferScheduler] No verified transfer articles to post.');
      return;
    }

    const urls = processed.map((a) => a.link);
    const alreadyPosted = await PostedNews.find({ url: { $in: urls } }).lean();
    const postedSet = new Set(alreadyPosted.map((p) => p.url));

    const fresh = processed.filter((a) => !postedSet.has(a.link));
    if (!fresh.length) return;

    try {
      await PostedNews.insertMany(fresh.map((a) => ({ url: a.link })), { ordered: false });
    } catch (err) {
      logger.debug('[TransferScheduler] Some URLs already persisted:', err.message);
    }

    let postedCount = 0;

    for (const guildConfig of guilds) {
      const channel = await resolvePostableChannel(
        this.client, guildConfig.channels.transfers.channelId, guildConfig.guildId, 'TransferScheduler'
      );
      if (!channel) continue;

      for (const article of fresh.slice(0, 2)) {
        const embed = new EmbedBuilder()
          .setColor('#9B59B6')
          .setTitle(clamp(article.formattedHeadline || article.title, 250))
          .setDescription(clamp(article.formattedBody || article.description || '', 380))
          .setURL(article.link)
          .setTimestamp(article.publishedAt)
          .setAuthor({ name: article.source || 'Transfer Source' })
          .setFooter({ text: `⚽ GoalX · Verified Transfers · Updated every 2 hrs` });

        if (article.imageUrl) embed.setImage(article.imageUrl);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('📤 Read Full Story')
            .setStyle(ButtonStyle.Link)
            .setURL(article.link)
        );

        const ok = await sendSafely(
          channel,
          { embeds: [embed], components: [row] },
          guildConfig.guildId,
          'TransferScheduler'
        );
        if (ok) postedCount++;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    logger.info(`[TransferScheduler] Posted ${postedCount} verified transfer update(s) across ${guilds.length} guild(s).`);
  }
}

module.exports = { TransferScheduler };
