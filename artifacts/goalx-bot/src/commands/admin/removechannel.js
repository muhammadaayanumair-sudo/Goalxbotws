'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const Guild = require('../../models/Guild');
const { logger } = require('../../utils/logger');

const CHANNEL_TYPES = {
  goals:     { label: '⚽ Goals',        description: 'live goal notifications' },
  fixtures:  { label: '📅 Fixtures',     description: 'daily fixture announcements' },
  live:      { label: '🔴 Live Scores',  description: 'live match updates' },
  matchday:  { label: '🗓️ Matchday',    description: 'matchday events and summaries' },
  lineups:   { label: '🏁 Lineups',     description: 'kickoff and lineup posts' },
  results:   { label: '🔴 Results',     description: 'full-time result posts' },
  news:      { label: '📰 News',         description: 'football news' },
  transfers: { label: '🔄 Transfers',    description: 'transfer news' },
  standings: { label: '🏆 Standings',    description: 'league standings updates' },
  welcome:   { label: '👋 Welcome',     description: 'welcome message', setter: '/setwelcome' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removechannel')
    .setDescription('🗑️ Remove a configured auto-post channel')
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('🗑️ Which channel type to remove')
        .setRequired(true)
        .addChoices(
          { name: '🗑️ Goals — live goal notifications', value: 'goals' },
          { name: '🗑️ Fixtures — daily match schedule', value: 'fixtures' },
          { name: '🗑️ Live Scores — match updates', value: 'live' },
          { name: '🗑️ Matchday — events and summaries', value: 'matchday' },
          { name: '🗑️ Lineups — kickoff and lineups', value: 'lineups' },
          { name: '🗑️ Results — full-time results', value: 'results' },
          { name: '🗑️ News — football news feed', value: 'news' },
          { name: '🗑️ Transfers — transfer alerts', value: 'transfers' },
          { name: '🗑️ Standings — league table updates', value: 'standings' },
          { name: '🗑️ Welcome — new member welcome message', value: 'welcome' },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  cooldown: 3,

  async execute(interaction) {
  try {
      await interaction.deferReply({ ephemeral: true });

      const type = interaction.options.getString('type');
      const info = CHANNEL_TYPES[type];

      if (!info) {
        return interaction.editReply({
          embeds: [EmbedFactory.error('Unknown Type', 'Please select a valid channel type.')],
        });
      }

      // Welcome is stored under guild.welcome, not channels.*
      if (type === 'welcome') {
        const guildDoc = await Guild.findOne({ guildId: interaction.guildId }).lean();
        if (!guildDoc?.welcome?.channelId) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning(`${info.label} Not Configured`, 'No welcome channel is set for this server.')],
          });
        }
        const previousChannelId = guildDoc.welcome.channelId;
        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          { $set: { 'welcome.channelId': null, 'welcome.enabled': false, 'welcome.message': null } },
          { upsert: true }
        );
        return interaction.editReply({
          embeds: [
            EmbedFactory.success(
              `${info.label} Removed`,
              `Welcome messages have been disabled.\n\nPreviously set to <#${previousChannelId}>.\nRun \`/setwelcome\` to configure a new welcome message anytime.`
            ),
          ],
        });
      }

      // Fetch current config to show what was removed
      const guildDoc = await Guild.findOne({ guildId: interaction.guildId }).lean();
      const current = guildDoc?.channels?.[type];

      if (!current?.channelId) {
        return interaction.editReply({
          embeds: [
            EmbedFactory.warning(
              `${info.label} Not Configured`,
              `There is no ${info.description} channel set for this server — nothing to remove.`
            ),
          ],
        });
      }

      const previousChannelId = current.channelId;

      await Guild.findOneAndUpdate(
        { guildId: interaction.guildId },
        {
          $set: {
            [`channels.${type}.channelId`]: null,
            [`channels.${type}.enabled`]: false,
            [`channels.${type}.roleId`]: null,
          },
        },
        { upsert: true }
      );

      const configCommand = {
        matchday: '/matchday channel',
        lineups: '/matchday channel',
        results: '/matchday channel',
        goals: '/feature-configuration goals',
        live: '/feature-configuration live',
        news: '/feature-configuration news',
        transfers: '/feature-configuration transfers',
        fixtures: '/feature-configuration fixtures',
        standings: '/setstandingschannel',
        welcome: '/setwelcome',
      }[type] || `/set${type}channel`;

            const helpRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('help:removechannel')
          .setLabel('❓ Help')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({
        embeds: [
          EmbedFactory.success(
            `${info.label} Channel Removed`,
            `**${info.description.charAt(0).toUpperCase() + info.description.slice(1)}** posts have been disabled.\n\n` +
            `Previously set to <#${previousChannelId}>.\n` +
            `Run \`${configCommand}\` to configure a new channel anytime.`
          ),
        ],
        components: [helpRow],
      });
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
