'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { LEAGUES } = require('../../constants/leagues');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('proleagues')
    .setDescription('🤝 Partner-only: detailed supported leagues and coverage'),

  cooldown: 10,

  async execute(interaction, client) {
    try {
      if (!await requirePartner(interaction)) return;

      const groups = {
        '🏆 Top 5 European': ['PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A', 'LIGUE_1'],
        '🌍 European Cups': ['CHAMPIONS_LEAGUE', 'EUROPA_LEAGUE', 'CONFERENCE_LEAGUE'],
        '🌐 International': ['WORLD_CUP', 'EUROS'],
        '🌏 Other Major Leagues': ['MLS', 'EREDIVISIE', 'PRIMEIRA_LIGA', 'SUPER_LIG', 'SCOTTISH_PREM'],
      };

      const embed = EmbedFactory.base('🏆 **Partner League Coverage**')
        .setDescription('🤝 *Partner-only detailed league list with IDs and coverage*\n');

      for (const [groupName, keys] of Object.entries(groups)) {
        const lines = keys.map((k) => {
          const l = LEAGUES[k];
          return `${l.flag} **${l.name}** (ID: ${l.id}) — Partner full coverage ✅`;
        });
        embed.addFields({ name: groupName, value: lines.join('\n'), inline: false });
      }

      embed.addFields({
        name: '💡 Partner Usage',
        value: '`/proleagues` · `/standings league:Premier League` · `/advancedstats` · `/impact`',
        inline: false,
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('refresh:proleagues').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
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
