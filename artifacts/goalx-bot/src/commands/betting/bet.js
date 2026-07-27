'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { BettingService } = require('../../services/betting/BettingService');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { resolveMatchByName } = require('../../utils/matchLookup');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bet')
    .setDescription('🎲 Place a virtual bet on an upcoming match')
    .addStringOption((opt) =>
      opt.setName('match')
        .setDescription('🎲 Match name, e.g. Arsenal vs Chelsea')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('type')
        .setDescription('🎲 Bet type')
        .setRequired(true)
        .addChoices(
          { name: '🎲 Match Winner',       value: 'winner' },
          { name: '🎲 Both Teams to Score', value: 'btts' },
          { name: '🎲 Over/Under Goals',    value: 'over_under' },
          { name: '🎲 Correct Score',       value: 'correct_score' }
        )
    )
    .addStringOption((opt) =>
      opt.setName('prediction')
        .setDescription('🎲 Your prediction (e.g. home / away / draw / yes / no / over_2_5 / 2-1)')
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('amount')
        .setDescription('🎲 Amount of GoalCoins to bet')
        .setRequired(true)
        .setMinValue(50)
        .setMaxValue(10000)
    ),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);

      const matchQuery = interaction.options.getString('match');
      const betType    = interaction.options.getString('type');
      const prediction = interaction.options.getString('prediction').toLowerCase().replace(' ', '_');
      const amount     = interaction.options.getInteger('amount');

      try {
        const fixture = await resolveMatchByName(api, matchQuery);
        const matchId = fixture.fixture?.id;

        const status = fixture.fixture?.status?.short;
        if (!['NS', 'TBD'].includes(status)) {
          return interaction.editReply({
            embeds: [EmbedFactory.error('Match Already Started', 'You can only bet on upcoming matches that have not started yet.')],
          });
        }

        const homeTeam  = fixture.teams?.home?.name;
        const awayTeam  = fixture.teams?.away?.name;
        const matchDate = fixture.fixture?.date;

        // Validate prediction
        const validPredictions = {
          winner:       ['home', 'draw', 'away'],
          btts:         ['yes', 'no'],
          over_under:   ['over_2_5', 'under_2_5', 'over_1_5', 'under_1_5'],
          correct_score: /^\d{1,2}-\d{1,2}$/,
        };

        const valid   = validPredictions[betType];
        const isValid = Array.isArray(valid) ? valid.includes(prediction) : valid.test(prediction);

        if (!isValid) {
          const examples = {
            winner:       'home, draw, away',
            btts:         'yes, no',
            over_under:   'over_2_5, under_2_5, over_1_5, under_1_5',
            correct_score: '2-1, 1-0, 0-0',
          };
          return interaction.editReply({
            embeds: [EmbedFactory.error('Invalid Prediction', `Valid predictions for **${betType}**: \`${examples[betType]}\``)],
          });
        }

        // Get odds (optional — predictions API may not be available)
        let apiPredictions = null;
        try {
          const preds = await api.getFixturePredictions(matchId);
          apiPredictions = preds?.[0] || null;
        } catch { /* predictions are optional */ }

        const odds        = BettingService.calculateOdds(betType, prediction, apiPredictions);
        const potentialWin = Math.floor(amount * odds * 0.95);

        const result = await BettingService.placeBet(interaction.user.id, {
          matchId: String(matchId),
          homeTeam,
          awayTeam,
          league: fixture.league?.name,
          matchDate,
          betType,
          prediction,
          amount,
          odds,
        });

        const embed = EmbedFactory.bet('Bet Placed!')
          .setDescription(`**${homeTeam}** vs **${awayTeam}**\n`)
          .addFields(
            { name: '🎲 Bet Type',      value: betType.replace(/_/g, ' ').toUpperCase(), inline: true },
            { name: '🎲 Prediction',    value: prediction.replace(/_/g, ' ').toUpperCase(), inline: true },
            { name: '🎲 Stake',         value: formatCoins(amount),    inline: true },
            { name: '🎲 Odds',          value: `${odds}x`,             inline: true },
            { name: '🎲 Potential Win', value: formatCoins(potentialWin), inline: true }
          )
          .setFooter({ text: '⚽ Powered by GoalX · For entertainment only, virtual coins only' });

                const helpRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('help:bet')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed] ,
          components: [helpRow]});
      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Bet Failed', err.message || 'Could not place bet.')],
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
