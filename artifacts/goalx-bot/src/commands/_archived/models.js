'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { AiService } = require('../../services/ai/AiService');
const config = require('../../config/config');
const { logger } = require('../../utils/logger');

const GROQ_MODELS = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    description: 'Best Groq quality. Ideal for chat, explanations, and quick Q&A.',
    speed: '⚡⚡⚡⚡',
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    description: 'Ultra-fast. Great for live match chat when latency matters most.',
    speed: '⚡⚡⚡⚡⚡',
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B',
    description: 'Long context window. Good for analysis with large data payloads.',
    speed: '⚡⚡⚡',
  },
];

const OR_MODELS = [
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Best-in-class reasoning. Used for deep analysis, predictions & recaps.',
    speed: '⚡⚡⚡',
    recommended: true,
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'OpenAI flagship. Strong at structured analysis and tactical breakdowns.',
    speed: '⚡⚡⚡',
  },
  {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash',
    description: 'Google\'s fast multimodal model. Good balance of speed and quality.',
    speed: '⚡⚡⚡⚡',
  },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('models')
    .setDescription('View the AI models powering GoalX'),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      const ai = new AiService(client.cache);
      const status = ai.getProviderStatus();

      const embed = EmbedFactory.ai('GoalX AI — Active Providers')
        .setDescription(
          'GoalX uses **two AI providers** with automatic routing:\n' +
          '**Groq** handles fast, conversational tasks. ' +
          '**OpenRouter** handles deep analysis where quality matters most.\n\n' +
          '*If one provider fails, the bot automatically falls back to the other.*'
        );

      // ── Groq section ────────────────────────────────────────────────────────
      const groqStatus = status.groq.configured ? '✅ Active' : '❌ Not configured';
      const groqActive = config.ai.model;
      embed.addFields({
        name: `⚡ Groq  ·  ${groqStatus}`,
        value: [
          `**Role:** ${status.groq.role}`,
          `**Active model:** \`${groqActive}\``,
          '',
          ...GROQ_MODELS.map((m) => {
            const tick = m.id === groqActive ? '▶ ' : '◦ ';
            return `${tick}**${m.name}** ${m.speed}\n  *${m.description}*`;
          }),
        ].join('\n'),
        inline: false,
      });

      // ── OpenRouter section ──────────────────────────────────────────────────
      const orStatus = status.openRouter.configured ? '✅ Active' : '❌ Not configured';
      const orActive = config.ai.openRouterModel;
      embed.addFields({
        name: `🌐 OpenRouter  ·  ${orStatus}`,
        value: [
          `**Role:** ${status.openRouter.role}`,
          `**Active model:** \`${orActive}\``,
          '',
          ...OR_MODELS.map((m) => {
            const tick = m.id === orActive ? '▶ ' : '◦ ';
            const rec = m.recommended ? ' ⭐' : '';
            return `${tick}**${m.name}**${rec} ${m.speed}\n  *${m.description}*`;
          }),
        ].join('\n'),
        inline: false,
      });

      // ── Routing guide ───────────────────────────────────────────────────────
      embed.addFields({
        name: '🔀 How Routing Works',
        value:
          '`/ask` `/explain` `/bio` `/chants`  →  **Groq** *(fast)*\n' +
          '`/analyze` `/predictions` `/recap` `/formguide` `/keyplayers`  →  **OpenRouter** *(quality)*',
        inline: false,
      });

      embed.setFooter({ text: '⚽ GoalX · Dual AI Providers' });
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
    logger.error(`[${interaction.commandName}] execute error:`, error);
    const msg = {
      embeds: [EmbedFactory.error('Something went wrong', error.message || 'An unexpected error occurred. Please try again.')],
      ephemeral: true,
    };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch (_) { /* interaction already timed out */ }
  }
},
};
