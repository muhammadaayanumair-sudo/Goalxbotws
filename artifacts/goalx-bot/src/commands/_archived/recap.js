'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { AiService } = require('../../services/ai/AiService');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

/**
 * /recap — AI narrative recap of a finished match.
 * Tries to resolve live fixture data first; falls back to pure-AI recap
 * when the Football API is unavailable or rate-limited.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('recap')
    .setDescription('AI writes a narrative recap of a finished match')
    .addStringOption((opt) =>
      opt.setName('match')
        .setDescription('Match name, e.g. Arsenal vs Chelsea')
        .setRequired(true)
    ),

  cooldown: 20,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      await interaction.deferReply();

      const api = new FootballApiManager(client.cache);
      const ai  = new AiService(client.cache);
      const matchQuery = interaction.options.getString('match');

      try {
        let homeTeam, awayTeam, finalScore, notableEvents = [];
        let dataSource = 'live';

        // Attempt live API resolution
        try {
          const { resolveMatchByName } = require('../../utils/matchLookup');
          const fixture = await resolveMatchByName(api, matchQuery);
          const matchId = fixture.fixture?.id;
          const status  = fixture.fixture?.status?.short;

          if (!['FT', 'AET', 'PEN'].includes(status)) {
            return interaction.editReply({
              embeds: [EmbedFactory.warning('Match Not Finished', "This match hasn't finished yet. Try again after full-time.")],
            });
          }

          const events = await api.getFixtureEvents(matchId).catch(() => []);
          homeTeam     = fixture.teams?.home?.name || 'Home';
          awayTeam     = fixture.teams?.away?.name || 'Away';
          const hg     = fixture.goals?.home ?? 0;
          const ag     = fixture.goals?.away ?? 0;
          finalScore   = `${hg}-${ag}`;
          notableEvents = (events || [])
            .filter((e) => ['Goal', 'Card'].includes(e.type))
            .map((e) => ({
              minute: e.time?.elapsed || '?',
              type:   e.type === 'Goal' ? (e.detail === 'Own Goal' ? 'Own Goal' : 'Goal') : e.detail || 'Card',
              player: e.player?.name || 'Unknown',
              team:   e.team?.name   || '',
            }));
        } catch {
          // Football API unavailable — do AI-only recap from the match name
          dataSource = 'ai-only';
          const parts = matchQuery.match(/^(.+?)\s+(?:vs?\.?|versus|\-)\s+(.+)$/i);
          homeTeam   = parts ? parts[1].trim() : matchQuery;
          awayTeam   = parts ? parts[2].trim() : 'Opponent';
          finalScore = '?-?';
        }

        const recap = await ai.matchRecap(homeTeam, awayTeam, finalScore, notableEvents);

        const titleSuffix = dataSource === 'ai-only' ? ` *(AI knowledge only)*` : '';
        const embed = EmbedFactory.ai(
          `Match Recap: ${homeTeam} ${finalScore} ${awayTeam}${titleSuffix}`,
          recap
        );

        if (dataSource === 'ai-only') {
          embed.setFooter({ text: '⚽ Powered by GoalX · Live data unavailable — recap based on AI knowledge' });
        }

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Error', err.message || 'Could not generate match recap.')],
        });
      }
    } catch (error) {
    const isExpiredInteraction = error.code === 10062;
    if (!isExpiredInteraction) {
      logger.error(`[${interaction.commandName}] execute error:`, error);
    }
    try {
      const msg = {
        embeds: [EmbedFactory.error('Something went wrong', error.message || 'An unexpected error occurred.')],
        flags: 64,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else if (!isExpiredInteraction) {
        await interaction.reply(msg);
      }
    } catch (_) { /* interaction already expired */ }
  }
},
};
