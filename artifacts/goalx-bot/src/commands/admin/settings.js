'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const Guild = require('../../models/Guild');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('⚙️ View or update GoalX server settings')
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('⚙️ View current server settings')
    )
    .addSubcommand((sub) =>
      sub.setName('timezone')
        .setDescription('⚙️ Set server timezone')
        .addStringOption((opt) =>
          opt.setName('zone').setDescription('⚙️ Timezone (e.g. Europe/London)').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('economy')
        .setDescription('⚙️ Toggle economy system')
        .addBooleanOption((opt) =>
          opt.setName('enabled').setDescription('⚙️ Enable or disable economy').setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  cooldown: 5,

  async execute(interaction) {
  try {
      const sub = interaction.options.getSubcommand();
      let guild = await Guild.findOne({ guildId: interaction.guildId });

      if (!guild) {
        guild = await Guild.create({
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          ownerId: interaction.guild.ownerId,
        });
      }

      if (sub === 'view') {
        const ch = guild.channels;
        const embed = EmbedFactory.base(`⚙️ **${interaction.guild.name} — GoalX Settings**`)
          .addFields(
            {
              name: '📡 Auto-Post Channels',
              value: [
                `**Live Ticker:** ${ch.live?.enabled ? `<#${ch.live.channelId}>` : '❌ Not set'}`,
                `**Fixtures:** ${ch.fixtures?.enabled ? `<#${ch.fixtures.channelId}>` : '❌ Not set'}`,
                `**Matchday:** ${ch.matchday?.enabled ? `<#${ch.matchday.channelId}>` : '❌ Not set'}`,
                `**Goals:** ${ch.goals?.enabled ? `<#${ch.goals.channelId}>` : '❌ Not set'}`,
                `**Lineups:** ${ch.lineups?.enabled ? `<#${ch.lineups.channelId}>` : '❌ Not set'}`,
                `**Results:** ${ch.results?.enabled ? `<#${ch.results.channelId}>` : '❌ Not set'}`,
                `**News:** ${ch.news?.enabled ? `<#${ch.news.channelId}>` : '❌ Not set'}`,
                `**Transfers:** ${ch.transfers?.enabled ? `<#${ch.transfers.channelId}>` : '❌ Not set'}`,
                `**Logs:** ${ch.log ? `<#${ch.log}>` : '❌ Not set'}`,
              ].join('\n'),
              inline: false,
            },
            {
              name: '🔧 General Settings',
              value: [
                `**Timezone:** ${guild.settings.timezone}`,
                `**Language:** ${guild.settings.language}`,
                `**Economy:** ${guild.economy.enabled ? '✅ Enabled' : '❌ Disabled'}`,
                `**Premium:** ${guild.premium ? '👑 Active' : '❌ Not Active'}`,
              ].join('\n'),
              inline: false,
            }
          );
                const helpRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('help:settings')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], ephemeral: true ,
          components: [helpRow]});
      }

      if (sub === 'timezone') {
        const zone = interaction.options.getString('zone');
        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          { $set: { 'settings.timezone': zone } }
        );
        return interaction.reply({
          embeds: [EmbedFactory.success('Timezone Updated', `Server timezone set to \`${zone}\``)],
          ephemeral: true,
        });
      }

      if (sub === 'economy') {
        const enabled = interaction.options.getBoolean('enabled');
        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          { $set: { 'economy.enabled': enabled } }
        );
        return interaction.reply({
          embeds: [EmbedFactory.success('Economy Updated', `Economy system is now ${enabled ? '✅ enabled' : '❌ disabled'}`)],
          ephemeral: true,
        });
      }
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
