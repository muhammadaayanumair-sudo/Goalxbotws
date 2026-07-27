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
    .setName('deepdive')
    .setDescription('🤝 Partner-only: AI deep-dive tactical analysis of a match')
    .addStringOption((opt) =>
      opt.setName('match').setDescription('🔍 Match name, e.g. Arsenal vs Chelsea').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('focus')
        .setDescription('🔍 Focus: tactics, form, h2h, or all')
        .setRequired(false)
        .addChoices(
          { name: '⚽ Tactics', value: 'tactics' },
          { name: '📈 Form', value: 'form' },
          { name: '🆚 Head-to-Head', value: 'h2h' },
          { name: '🔍 All', value: 'all' }
        )
    ),

  cooldown: 30,

  async execute(interaction, client) {
    try {
      if (!await requirePartner(interaction)) return;
      await interaction.deferReply();

      const api = new FootballApiManager(client.cache);
      const ai = new AiService(client.cache);
      const matchQuery = interaction.options.getString('match');
      const focus = interaction.options.getString('focus') || 'all';

      try {
        const fixture = await resolveMatchByName(api, matchQuery);
        const home = fixture.teams?.home?.name || 'Home';
        const away = fixture.teams?.away?.name || 'Away';
        const league = fixture.league?.name || 'Unknown';
        const date = fixture.fixture?.date ? `<t:${Math.floor(new Date(fixture.fixture.date).getTime() / 1000)}:F>` : 'TBC';

        const analysis = await ai.deepDive(home, away, league, focus);

        const embed = EmbedFactory.ai(`🔍 Deep Dive: ${home} vs ${away}`, analysis)
          .addFields(
            { name: '🏆 League', value: league, inline: true },
            { name: '🕐 Kickoff', value: date, inline: true },
            { name: '🎯 Focus', value: focus, inline: true },
          )
          .setFooter({ text: '⚽ GoalX Partner · Deep Dive Analysis' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('help:deepdive').setLabel('❓ Help').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Could not generate deep dive.')] });
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
