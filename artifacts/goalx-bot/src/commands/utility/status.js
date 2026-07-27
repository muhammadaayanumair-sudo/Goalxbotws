'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const mongoose = require('mongoose');
const config = require('../../config/config');
const Guild = require('../../models/Guild');

/**
 * Checks whether a configured channel actually exists and is postable —
 * the same real-world checks the schedulers perform, exposed here so
 * anyone can self-diagnose "why isn't my channel receiving messages?"
 * without needing to read Railway logs.
 */
async function checkChannel(client, channelConfig, label) {
  if (!channelConfig?.enabled || !channelConfig?.channelId) {
    return { label, ok: null, detail: 'Not set up — use the matching `/set*channel` command' };
  }

  let channel;
  try {
    channel = await client.channels.fetch(channelConfig.channelId);
  } catch {
    return { label, ok: false, detail: `⚠️ Channel not found (may have been deleted) — re-run the setup command` };
  }

  if (!channel) {
    return { label, ok: false, detail: '⚠️ Channel not found — re-run the setup command' };
  }

  const me = channel.guild?.members?.me;
  const perms = channel.permissionsFor(me);
  const required = ['ViewChannel', 'SendMessages', 'EmbedLinks'];
  const missing = required.filter((p) => !perms?.has(p));

  if (missing.length > 0) {
    return { label, ok: false, detail: `⚠️ #${channel.name} — missing permissions: ${missing.join(', ')}` };
  }

  return { label, ok: true, detail: `✅ #${channel.name} — ready to receive posts` };
}

/**
 * /status — shows exactly which features are configured and working.
 * This is the single command that answers "why isn't X working?"
 * without needing to check Railway logs.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('✅ Check which GoalX features are configured and active'),

  cooldown: 10,

  async execute(interaction, client) {
    const dbState = mongoose.connection.readyState;
    const dbLabel = ['🔴 Disconnected', '🟢 Connected', '🟡 Connecting', '🟡 Disconnecting'][dbState] || '⚪ Unknown';

    const checks = [
      {
        name: '🗄️ Database',
        ok: dbState === 1,
        detail: dbLabel,
      },
      {
        name: '⚽ Football Data (API-Football)',
        ok: Boolean(config.apis.apiFootball.key),
        detail: config.apis.apiFootball.key ? 'Configured ✅' : 'Missing `API_FOOTBALL_KEY` — /live, /fixtures, /results, /standings etc. will not work',
      },
      {
        name: '⚽ Football Data Fallback (football-data.org)',
        ok: Boolean(config.apis.footballData.key),
        detail: config.apis.footballData.key ? 'Configured ✅' : 'Missing `FOOTBALL_DATA_KEY` — no fallback if primary API fails',
      },
      {
        name: '🤖 AI Chat Providers',
        ok: Boolean(config.ai.apiKey || config.ai.openRouterApiKey || config.ai.cerebrasApiKey || config.ai.sambanovaApiKey || config.ai.glmApiKey || config.ai.githubModelsToken || config.ai.siliconFlowApiKey || config.ai.xaiApiKey),
        detail: (() => {
          const active = [
            config.ai.apiKey && 'Groq',
            config.ai.openRouterApiKey && 'OpenRouter',
            config.ai.cerebrasApiKey && 'Cerebras',
            config.ai.sambanovaApiKey && 'SambaNova',
            config.ai.glmApiKey && 'GLM',
            config.ai.githubModelsToken && 'GitHub Models',
            config.ai.siliconFlowApiKey && 'SiliconFlow',
            config.ai.xaiApiKey && 'xAI',
          ].filter(Boolean);
          return active.length > 0 ? `Configured ✅ (${active.join(', ')})` : 'Missing AI keys — /ask, /analyze, /predictions, /explain will not work';
        })(),
      },
      {
        name: '🔍 Search & NLP Tools',
        ok: Boolean(config.ai.exaApiKey || config.ai.cohereApiKey || config.ai.huggingfaceApiKey),
        detail: (() => {
          const active = [
            config.ai.exaApiKey && 'Exa search',
            config.ai.cohereApiKey && 'Cohere rerank',
            config.ai.huggingfaceApiKey && 'HuggingFace classify',
          ].filter(Boolean);
          return active.length > 0 ? `Configured ✅ (${active.join(', ')})` : 'Missing EXA_API_KEY, COHERE_API_KEY, HUGGINGFACE_API_KEY — web grounding/reranking disabled';
        })(),
      },
      {
        name: '📰 News (NewsAPI)',
        ok: Boolean(config.news.apiKey),
        detail: config.news.apiKey ? 'Configured ✅' : 'Missing `NEWS_API_KEY` — /news, /transfernews will not work',
      },
      {
        name: '🛡️ Owner Commands',
        ok: Boolean(process.env.BOT_OWNER_ID),
        detail: process.env.BOT_OWNER_ID ? 'Configured ✅' : 'Missing `BOT_OWNER_ID` — /admin, /broadcast disabled',
      },
      {
        name: '💾 Cache',
        ok: true,
        detail: 'In-memory (node-cache) — always active, no setup needed',
      },
    ];

    const workingCount = checks.filter((c) => c.ok).length;
    const allHealthy = workingCount === checks.length;

    const embed = allHealthy
      ? EmbedFactory.success('GoalX System Status', `**${workingCount}/${checks.length}** features fully configured\nBot uptime: ${client.getUptime?.() || 'N/A'}\n`)
      : EmbedFactory.warning('GoalX System Status', `**${workingCount}/${checks.length}** features fully configured\nBot uptime: ${client.getUptime?.() || 'N/A'}\n`);

    embed.setFooter({ text: '⚽ Powered by GoalX · Add missing keys in Railway → Variables' });

    EmbedFactory.addFields(embed, checks.map((check) => ({
      name: `${check.ok ? '✅' : '⚠️'} ${check.name}`,
      value: check.detail,
    })));

    // ── Per-guild auto-post channel diagnostics ──────────────────────────
    if (interaction.guildId) {
      const guildConfig = await Guild.findOne({ guildId: interaction.guildId }).lean();

      if (guildConfig?.channels) {
        const channelChecks = await Promise.all([
          checkChannel(client, guildConfig.channels.live, 'Live Scores'),
          checkChannel(client, guildConfig.channels.goals, 'Goal Alerts'),
          checkChannel(client, guildConfig.channels.fixtures, 'Fixtures'),
          checkChannel(client, guildConfig.channels.news, 'News'),
          checkChannel(client, guildConfig.channels.transfers, 'Transfers'),
          checkChannel(client, guildConfig.features?.fabrizioRomanoPosts, 'Fabrizio Romano Posts'),
        ]);

        const configured = channelChecks.filter((c) => c.ok !== null);
        if (configured.length > 0) {
          EmbedFactory.addFields(embed, [{
            name: '📡 This Server\'s Auto-Post Channels',
            value: configured.map((c) => `**${c.label}:** ${c.detail}`).join('\n'),
          }]);
        } else {
          EmbedFactory.addFields(embed, [{
            name: '📡 This Server\'s Auto-Post Channels',
            value: 'No auto-post channels configured yet. Use `/feature-configuration fixtures`, `/feature-configuration live`, `/feature-configuration goals`, `/feature-configuration news`, `/feature-configuration transfers`, or `/feature-configuration fabrizio-romano-posts add` to set one up.',
          }]);
        }
      }

      if (guildConfig?.features?.introDm) {
        const intro = guildConfig.features.introDm;
        EmbedFactory.addFields(embed, [{
          name: '✉️ Intro DM',
          value: intro.enabled
            ? `Enabled — new members will receive a DM.${intro.message ? '' : ' (default message)'}`
            : 'Not enabled — use `/feature-configuration intro-dm` to set one up.',
        }]);
      }
    }

    
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:status')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.reply({ embeds: [embed], ephemeral: true ,
        components: [refreshRow]});
  },
};
