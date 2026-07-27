'use strict';

const { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { logger } = require('../../utils/logger');

const FACT_KEYWORDS = ['current team', 'plays for', 'play for', 'which club', 'where does', 'which team', 'nationality', 'current club', 'what team', 'what club', 'who does', 'club does'];
const STOPWORDS = new Set(['which', 'what', 'where', 'who', 'does', 'do', 'is', 'are', 'the', 'a', 'an', 'for', 'team', 'club', 'current', 'player', 'play', 'plays', 'his', 'her', 'their', 'in', 'of', 'on', 'at', 'and']);

function isFactLookup(question) {
  const q = question.toLowerCase();
  return FACT_KEYWORDS.some((k) => q.includes(k));
}

function extractEntityName(question) {
  const tokens = question.trim().split(/\s+/).filter(Boolean);
  const nameTokens = [];
  for (const t of tokens) {
    const clean = t.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean && !STOPWORDS.has(clean)) {
      nameTokens.push(t);
      if (nameTokens.length >= 2) break;
    }
  }
  return nameTokens.join(' ') || question;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('🤖 Ask GoalX AI anything about football')
    .addSubcommand((s) => s
      .setName('chat')
      .setDescription('🤖 Ask GoalX AI a football question (keeps conversation context)')
      .addStringOption((o) => o
        .setName('question')
        .setDescription('🤖 Your football question')
        .setRequired(true)
        .setMaxLength(500)))
    .addSubcommand((s) => s
      .setName('clear')
      .setDescription('🤖 Clear your conversation history and start fresh')),

  cooldown: 10,

  async execute(interaction, client) {
    try {
      const sub = interaction.options.getSubcommand();

      // ── /ask clear ───────────────────────────────────────────────────────────
      if (sub === 'clear') {
        const ai = client.aiRouter;
        const histLen = ai.getHistoryLength(interaction.user.id);
        ai.clearHistory(interaction.user.id);
        return interaction.reply({
          embeds: [EmbedFactory.success('Conversation Cleared',
            histLen > 0
              ? `Cleared **${histLen}** message${histLen === 1 ? '' : 's'} from your conversation history.\n\nStart fresh with \`/ask chat\`.`
              : 'Your conversation history was already empty.')],
          ephemeral: true,
        });
      }

      // ── /ask chat ────────────────────────────────────────────────────────────
      await interaction.deferReply();
      const ai       = client.aiRouter;
      const question = interaction.options.getString('question');
      const histLen  = ai.getHistoryLength(interaction.user.id);

      let contextData = null;
      try {
        if (isFactLookup(question)) {
          const api = new FootballApiManager(client.cache);
          const query = extractEntityName(question);
          const playerResults = await api.searchPlayer(query);
          if (playerResults?.length) {
            const p = playerResults[0].player;
            const stats = playerResults[0].statistics?.[0];
            contextData = {
              player: p.name,
              currentClub: stats?.team?.name,
              position: stats?.games?.position,
              nationality: p.nationality,
              age: p.age,
            };
          } else {
            const teamResults = await api.searchTeam(query);
            if (teamResults?.length) {
              const t = teamResults[0].team;
              contextData = { team: t.name, country: t.country, founded: t.founded };
            }
          }
        }
      } catch (_) { /* ignore lookup failures, answer without context */ }

      try {
        const response = await ai.chat(interaction.user.id, question, contextData);

        // Nicely format the response — split into sections if it has markdown headers
        const formatted = response.slice(0, 3900);

        const embed = EmbedFactory.ai('GoalX AI')
          .setDescription(formatted)
          .addFields({
            name: '❓ Question',
            value: `*${question.slice(0, 500)}*`,
            inline: false,
          })
          .setFooter({
            text: [
              '⚽ Powered by GoalX · Groq AI',
              histLen > 0 ? `💬 ${histLen + 2} messages in context` : '💬 New conversation',
              'Use /ask clear to reset',
            ].join(' · '),
          });

                const helpRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('help:ask')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed] ,
          components: [helpRow]});
      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('AI Unavailable', err.message || 'The AI service is temporarily unavailable. Try again in a moment.')],
        });
      }
    } catch (error) {
      const expired = error.code === 10062;
      if (!expired) logger.error(`[ask] execute error:`, error);
      try {
        const msg = {
          embeds: [EmbedFactory.error('Something went wrong', error.message || 'An unexpected error occurred.')],
          flags: 64,
        };
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else if (!expired) await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
