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

// Shared dedup model with the other news schedulers.
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
 * FabrizioRomanoScheduler — posts the latest Fabrizio Romano news to
 * guilds that have configured a channel via /feature-configuration.
 */
class FabrizioRomanoScheduler {
  constructor(client) {
    this.client = client;
  }

  async run() {
    const guilds = await Guild.find({
      'features.fabrizioRomanoPosts.enabled': true,
      'features.fabrizioRomanoPosts.channelId': { $ne: null },
    }).lean();

    if (!guilds.length) return;

    const newsService = new NewsService(this.client.cache);
    const pipeline = new NewsPipelineEngine(this.client.aiRouter, this.client.cache);

    let articles;
    try {
      articles = await newsService.searchNews('Fabrizio Romano', 15);
    } catch (err) {
      logger.error('[FabrizioRomanoScheduler] Failed to fetch news:', err.message);
      return;
    }

    let processed = [];
    try {
      processed = await pipeline.process(articles, { query: 'Fabrizio Romano football transfer exclusive', limit: 5 });
    } catch (err) {
      logger.error('[FabrizioRomanoScheduler] Pipeline failed:', err.message);
      processed = articles.filter((a) => {
        const text = `${a.title} ${a.description || ''}`.toLowerCase();
        return text.includes('fabrizio romano');
      }).slice(0, 5).map((a) => ({ ...a, formattedHeadline: a.title, formattedBody: a.description || '' }));
    }

    if (!processed.length) {
      logger.info('[FabrizioRomanoScheduler] No verified Fabrizio Romano articles to post.');
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
      logger.debug('[FabrizioRomanoScheduler] Some URLs already persisted:', err.message);
    }

    let postedCount = 0;

    for (const guildConfig of guilds) {
      const channel = await resolvePostableChannel(
        this.client,
        guildConfig.features.fabrizioRomanoPosts.channelId,
        guildConfig.guildId,
        'FabrizioRomanoScheduler'
      );
      if (!channel) continue;

      for (const article of fresh.slice(0, 2)) {
        const embed = new EmbedBuilder()
          .setColor('#1DA1F2')
          .setTitle(clamp(article.formattedHeadline || article.title, 250))
          .setDescription(clamp(article.formattedBody || article.description || '', 380))
          .setURL(article.link)
          .setTimestamp(article.publishedAt)
          .setAuthor({ name: article.source || 'Fabrizio Romano Source' })
          .setFooter({ text: '⚽ GoalX · Verified Fabrizio Romano Posts' });

        if (article.imageUrl) embed.setImage(article.imageUrl);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('📰 Read Full Story')
            .setStyle(ButtonStyle.Link)
            .setURL(article.link)
        );

        const ok = await sendSafely(
          channel,
          { embeds: [embed], components: [row] },
          guildConfig.guildId,
          'FabrizioRomanoScheduler'
        );
        if (ok) postedCount++;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    logger.info(`[FabrizioRomanoScheduler] Posted ${postedCount} verified Fabrizio Romano article(s) across ${guilds.length} guild(s).`);
  }
}

module.exports = { FabrizioRomanoScheduler };