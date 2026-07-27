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
    .setName('protip')
    .setDescription('🤝 Partner-only: AI-powered daily betting tip for a match')
    .addStringOption((opt) =>
      opt.setName('match').setDescription('🎲 Match name, e.g. Arsenal vs Chelsea').setRequired(true)
    ),

  cooldown: 30,

  async execute(interaction, client) {
    try {
      if (!await requirePartner(interaction)) return;
      await interaction.deferReply();

      const api = new FootballApiManager(client.cache);
      const ai = new AiService(client.cache);
      const matchQuery = interaction.options.getString('match');

      try {
        const fixture = await resolveMatchByName(api, matchQuery);
        const home = fixture.teams?.home?.name || 'Home';
        const away = fixture.teams?.away?.name || 'Away';
        const league = fixture.league?.name || 'Unknown';
        const date = fixture.fixture?.date ? `<t:${Math.floor(new Date(fixture.fixture.date).getTime() / 1000)}:F>` : 'TBC';

        const tip = await ai.bettingTip(home, away, league);

        const embed = EmbedFactory.ai(`🎲 Pro Tip: ${home} vs ${away}`, tip)
          .addFields(
            { name: '🏆 League', value: league, inline: true },
            { name: '🕐 Kickoff', value: date, inline: true },
          )
          .setFooter({ text: '⚽ GoalX Partner · For entertainment only' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('help:protip').setLabel('❓ Help').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Could not generate pro tip.')] });
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
