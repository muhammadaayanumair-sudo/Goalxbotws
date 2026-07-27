'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { AiService } = require('../../services/ai/AiService');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('predictions')
    .setDescription('🔮 Get AI-powered match prediction — no ID needed')
    .addStringOption((opt) => opt.setName('home').setDescription('🔮 Home team name').setRequired(true))
    .addStringOption((opt) => opt.setName('away').setDescription('🔮 Away team name').setRequired(true)),

  cooldown: 30,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const ai  = new AiService(client.cache);

      const home = interaction.options.getString('home');
      const away = interaction.options.getString('away');

      try {
        let contextData = null;
        let apiPercent  = null;

        // Try to find an upcoming fixture between these teams for real API odds
        try {
          const teams = await api.searchTeam(home);
          if (teams?.length) {
            const fixtures = await api.getFixturesByTeam(teams[0].team.id, 15);
            const match = fixtures?.find((f) =>
              f.fixture?.status?.short === 'NS' &&
              (f.teams?.away?.name?.toLowerCase().includes(away.toLowerCase()) ||
               f.teams?.home?.name?.toLowerCase().includes(away.toLowerCase()))
            );

            if (match) {
              const predictions = await api.getFixturePredictions(match.fixture.id).catch(() => null);
              const pred = predictions?.[0];
              if (pred) {
                apiPercent = pred.predictions?.percent;
                contextData = {
                  homeWinChance: apiPercent?.home,
                  drawChance:    apiPercent?.draw,
                  awayWinChance: apiPercent?.away,
                  advice:        pred.predictions?.advice,
                  winner:        pred.predictions?.winner?.name,
                  homeForm:      pred.teams?.home?.last_5?.form,
                  awayForm:      pred.teams?.away?.last_5?.form,
                };
              }
            }
          }
        } catch { /* live data optional — AI still predicts without it */ }

        const prediction = await ai.predictMatch(home, away, contextData);

        const embed = EmbedFactory.ai(`Prediction: ${home} vs ${away}`, prediction);
        embed.setFooter({ text: '⚽ Powered by GoalX · Powered by Groq ⚡ · Entertainment only, not financial advice' });

        if (apiPercent) {
          EmbedFactory.addFields(embed, [{
            name: '📊 Live API Odds',
            value: [
              `🏠 **${home}**: ${apiPercent.home}`,
              `🟡 **Draw**: ${apiPercent.draw}`,
              `✈️ **${away}**: ${apiPercent.away}`,
            ].join('  ·  '),
          }]);
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`predict_bet:${home}:${away}`).setLabel('🎰 Place a Bet').setStyle(ButtonStyle.Success),
        );

        const msg = await interaction.editReply({ embeds: [embed], components: [row] });

        const collector = msg.createMessageComponentCollector({
          filter: (i) => i.customId.startsWith('predict_bet:') && i.user.id === interaction.user.id,
          time: 60_000,
          max: 1,
        });

        collector.on('collect', async (i) => {
          await i.reply({
            content: `🎰 Use \`/bet\` with the matching fixture ID from \`/fixtures\` to bet on **${home} vs ${away}**!`,
            ephemeral: true,
          });
        });

      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Prediction Failed', err.message || 'Could not generate prediction.')],
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
