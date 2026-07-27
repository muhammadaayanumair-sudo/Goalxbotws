'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory, PALETTE } = require('../../utils/embed');
const Guild = require('../../models/Guild');
const { resolvePostableChannel } = require('../../scheduler/channelDelivery');
const { logger } = require('../../utils/logger');

const EVENT_CHOICES = [
  { name: '⚽ Kickoff / Lineups', value: 'lineups' },
  { name: '⚽ Goals', value: 'goals' },
  { name: '⚽ Red Cards', value: 'redCards' },
  { name: '⚽ Yellow Cards', value: 'yellowCards' },
  { name: '⚽ Substitutions', value: 'substitutions' },
  { name: '⚽ Halftime', value: 'halftime' },
  { name: '⚽ Full Time', value: 'fulltime' },
  { name: '⚽ Penalty Shootouts', value: 'penalties' },
  { name: '⚽ Matchday Summary', value: 'matchdaySummary' },
  { name: '⚽ Live Ticker (every minute)', value: 'liveTicker' },
  { name: '⚽ Followed Only Filter', value: 'followedOnly' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('matchday')
    .setDescription('⚽ Configure the matchday auto-post engine')
    .addSubcommand((sub) =>
      sub.setName('channel')
        .setDescription('⚽ Set the matchday channel for kickoffs, cards, HT, FT, and daily summaries')
        .addChannelOption((opt) =>
          opt.setName('channel')
            .setDescription('⚽ Channel to post matchday events in (omit to disable)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('events')
        .setDescription('⚽ Toggle which match events are auto-posted')
        .addStringOption((opt) =>
          opt.setName('event')
            .setDescription('⚽ Event to toggle')
            .setRequired(true)
            .addChoices(...EVENT_CHOICES)
        )
        .addBooleanOption((opt) =>
          opt.setName('enabled')
            .setDescription('⚽ Enable or disable this event')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('settings')
        .setDescription('⚽ View current matchday auto-post settings')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  cooldown: 5,

  async execute(interaction) {
  try {
      await interaction.deferReply({ ephemeral: true });
      const sub = interaction.options.getSubcommand();

      let guild = await Guild.findOne({ guildId: interaction.guildId });
      if (!guild) {
        guild = await Guild.create({
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          ownerId: interaction.guild.ownerId,
        });
      }

      if (sub === 'channel') {
        const channel = interaction.options.getChannel('channel');
        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          {
            $set: {
              'channels.matchday.channelId': channel?.id || null,
              'channels.matchday.enabled': Boolean(channel),
            },
          }
        );

        if (!channel) {
          const helpRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('help:matchday')
              .setLabel('❓ Help')
              .setStyle(ButtonStyle.Secondary)
          );

          return interaction.editReply({
            embeds: [EmbedFactory.warning('Matchday Channel Disabled', 'Matchday auto-posts have been turned off.')],
            components: [helpRow],
          });
        }

        const preview = new EmbedBuilder()
          .setColor(PALETTE.fixture)
          .setTitle('🗓️  Matchday Channel Connected!')
          .setDescription(
            '✅ This channel will now receive **matchday events**:\n\n' +
            '• Kickoff & lineups\n' +
            '• Red cards, substitutions, HT/FT\n' +
            '• Penalty shootouts\n' +
            '• Daily matchday summary at 09:00 UTC\n\n' +
            'Use `/matchday events` to choose exactly which events are posted.'
          )
          .setFooter({ text: '⚽ GoalX · Matchday channel configured' })
          .setTimestamp();

        try {
          await channel.send({ embeds: [preview] });
        } catch {
          return interaction.editReply({
            embeds: [
              EmbedFactory.warning(
                'Matchday Channel Set — Check Permissions',
                `Saved <#${channel.id}> as the matchday channel, but I couldn't send a test message there.\n` +
                'Please make sure I have **Send Messages** and **Embed Links** permissions in that channel.'
              ),
            ],
          });
        }

        return interaction.editReply({
          embeds: [
            EmbedFactory.success(
              'Matchday Channel Set ✅',
              `Matchday events and the daily summary will be posted in ${channel}.\n` +
              `A confirmation message was sent there.\n\n` +
              `Use \`/matchday events\` to fine-tune which events are posted.`
            ),
          ],
        });
      }

      if (sub === 'events') {
        const event = interaction.options.getString('event');
        const enabled = interaction.options.getBoolean('enabled');
        const field = event === 'followedOnly' ? 'autoPost.followedOnly' : `autoPost.${event}`;

        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          { $set: { [field]: enabled } }
        );

        const label = EVENT_CHOICES.find((c) => c.value === event)?.name || event;
        return interaction.editReply({
          embeds: [EmbedFactory.success('Matchday Setting Updated', `${label} is now **${enabled ? 'enabled' : 'disabled'}**.`)],
        });
      }

      if (sub === 'settings') {
        const ap = guild.autoPost || {};
        const ch = guild.channels || {};
        const embed = EmbedFactory.base(`🗓️ Matchday Settings — ${interaction.guild.name}`)
          .addFields(
            {
              name: '📡 Channels',
              value: [
                `**Matchday:** ${ch.matchday?.enabled ? `<#${ch.matchday.channelId}>` : '❌ Not set'}`,
                `**Goals:** ${ch.goals?.enabled ? `<#${ch.goals.channelId}>` : '❌ Not set'}`,
                `**Lineups:** ${ch.lineups?.enabled ? `<#${ch.lineups.channelId}>` : '❌ Not set'}`,
                `**Live Ticker:** ${ch.live?.enabled ? `<#${ch.live.channelId}>` : '❌ Not set'}`,
                `**Results:** ${ch.results?.enabled ? `<#${ch.results.channelId}>` : '❌ Not set'}`,
              ].join('\n'),
              inline: false,
            },
            {
              name: '⚙️ Event Toggles',
              value: [
                `Kickoff/Lineups: ${ap.lineups !== false ? '✅' : '❌'}`,
                `Goals: ${ap.goals !== false ? '✅' : '❌'}`,
                `Red Cards: ${ap.redCards !== false ? '✅' : '❌'}`,
                `Yellow Cards: ${ap.yellowCards ? '✅' : '❌'}`,
                `Substitutions: ${ap.substitutions ? '✅' : '❌'}`,
                `Halftime: ${ap.halftime !== false ? '✅' : '❌'}`,
                `Full Time: ${ap.fulltime !== false ? '✅' : '❌'}`,
                `Penalties: ${ap.penalties !== false ? '✅' : '❌'}`,
                `Matchday Summary: ${ap.matchdaySummary !== false ? '✅' : '❌'}`,
                `Live Ticker: ${ap.liveTicker ? '✅' : '❌'}`,
                `Followed Only: ${ap.followedOnly ? '✅' : '❌'}`,
              ].join('\n'),
              inline: false,
            }
          );
        return interaction.editReply({ embeds: [embed] });
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
