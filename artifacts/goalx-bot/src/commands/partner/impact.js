'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { AiService } = require('../../services/ai/AiService');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { resolveMatchByName } = require('../../utils/matchLookup');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('impact')
    .setDescription('🤝 Partner-only: AI predicts the 3 most impactful players')
    .addStringOption((opt) =>
      opt.setName('match').setDescription('⚽ Match name, e.g. Arsenal vs Chelsea').setRequired(true)
    ),

  cooldown: 20,

  async execute(interaction, client) {
    try {
      if (!await requirePartner(interaction)) return;
      await interaction.deferReply();

      const api = new FootballApiManager(client.cache);
      const ai = new AiService(client.cache);
      const matchQuery = interaction.options.getString('match');

      try {
        const fixture = await resolveMatchByName(api, matchQuery);
        const matchId = fixture.fixture?.id;
        const lineups = await api.getFixtureLineups(matchId);

        if (!lineups?.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('No Lineup Yet', 'Lineup not yet announced for this match. Check back closer to kickoff.')],
          });
        }

        const [home, away] = lineups;
        const homeTeam = home.team?.name || 'Home';
        const awayTeam = away.team?.name || 'Away';
        const homePlayers = (home.startXI || []).map((p) => p.player?.name).filter(Boolean);
        const awayPlayers = (away.startXI || []).map((p) => p.player?.name).filter(Boolean);

        if (!homePlayers.length || !awayPlayers.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('Incomplete Lineup', 'Lineup data is incomplete for this match.')],
          });
        }

        const analysis = await ai.keyPlayers(homeTeam, awayTeam, homePlayers, awayPlayers);

        const embed = EmbedFactory.ai(`🌟 Impact Players: ${homeTeam} vs ${awayTeam}`, analysis);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('help:impact').setLabel('❓ Help').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Could not predict impact players.')] });
      }
    } catch (error) {
      logger.error(`[${interaction.commandName}] execute error:`, error);
      const msg = { embeds: [EmbedFactory.error('Error', error.message || 'Something went wrong.')], flags: 64 };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
