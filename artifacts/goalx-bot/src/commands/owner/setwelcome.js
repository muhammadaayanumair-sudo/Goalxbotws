'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const Guild = require('../../models/Guild');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('👋 Configure the welcome message for new members')
    .addSubcommand((sub) =>
      sub.setName('set')
        .setDescription('👋 Set the welcome channel and message')
        .addChannelOption((opt) =>
          opt.setName('channel')
            .setDescription('👋 Channel to send welcome messages in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('message')
            .setDescription('👋 Message text. Variables: {user} {username} {server} {count}')
            .setRequired(false)
            .setMaxLength(1000)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('disable')
        .setDescription('👋 Disable welcome messages')
    )
    .addSubcommand((sub) =>
      sub.setName('returning')
        .setDescription('👋 Set a custom greeting for members who rejoin the server')
        .addStringOption((opt) =>
          opt.setName('message')
            .setDescription('👋 Message text. Variables: {user} {username} {server} {count}')
            .setRequired(false)
            .setMaxLength(1000)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('test')
        .setDescription('👋 Preview the current welcome message')
        .addStringOption((opt) =>
          opt.setName('type')
            .setDescription('👋 Which welcome message to preview')
            .setRequired(false)
            .addChoices(
              { name: 'New member', value: 'new' },
              { name: 'Returning member', value: 'returning' },
            )
        )
    )
    .addSubcommand((sub) =>
      sub.setName('status')
        .setDescription('👋 View the current welcome configuration')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  cooldown: 5,

  async execute(interaction) {
  try {
      await interaction.deferReply({ ephemeral: true });

      const sub = interaction.options.getSubcommand();

      if (sub === 'set') {
        const channel = interaction.options.getChannel('channel');
        const message = interaction.options.getString('message') ||
          'Welcome to **{server}**, {user}! 🎉 You are member **#{count}**. Enjoy the football talk and use `/help` to see all GoalX commands!';

        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          {
            $set: {
              'welcome.channelId': channel.id,
              'welcome.enabled': true,
              'welcome.message': message,
            },
          },
          { upsert: true }
        );

                const helpRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('help:setwelcome')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.editReply({
          embeds: [
            EmbedFactory.success('Welcome Message Set',
              `New members will be greeted in ${channel}.\n\n**Preview:**\n${formatPreview(message, interaction.user, interaction.guild)}`
            ),
          ],
          components: [helpRow],
        });
      }

      if (sub === 'disable') {
        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          { 'welcome.enabled': false },
          { upsert: true }
        );

        return interaction.editReply({
          embeds: [EmbedFactory.warning('Welcome Disabled', 'Welcome messages have been turned off.')],
        });
      }

      if (sub === 'returning') {
        const message = interaction.options.getString('message') ||
          'Welcome back to **{server}**, {user}! 🎉 You are member **#{count}**. Good to have you again!';

        const guildDoc = await Guild.findOne({ guildId: interaction.guildId }).lean();
        const update = {
          'welcome.returningMessage': message,
          'welcome.returningEnabled': true,
        };
        if (guildDoc?.welcome?.channelId) {
          update['welcome.enabled'] = true;
        }

        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          { $set: update },
          { upsert: true }
        );

        const channelMention = guildDoc?.welcome?.channelId
          ? `<#${guildDoc.welcome.channelId}>`
          : '*(not set — configure one with `/setwelcome set`)*';

        return interaction.editReply({
          embeds: [
            EmbedFactory.success('Returning Member Greeting Set',
              `Members who rejoin will be greeted in ${channelMention}.\n\n**Preview:**\n${formatPreview(message, interaction.user, interaction.guild)}`
            ),
          ],
        });
      }

      if (sub === 'test') {
        const guild = await Guild.findOne({ guildId: interaction.guildId }).lean();

        if (!guild?.welcome?.enabled || !guild?.welcome?.channelId) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('Not Configured', 'Use `/setwelcome set` to configure welcome messages first.')],
          });
        }

        const channel = interaction.guild.channels.cache.get(guild.welcome.channelId);
        if (!channel) {
          return interaction.editReply({
            embeds: [EmbedFactory.error('Channel Not Found', 'The configured welcome channel no longer exists. Please set a new one.')],
          });
        }

        const type = interaction.options.getString('type') || 'new';
        const isReturningTest = type === 'returning';
        const defaultWelcome = 'Welcome to **{server}**, {user}! 🎉 You are member **#{count}**. Enjoy the football talk and use `/help` to see all GoalX commands!';
        const defaultReturning = 'Welcome back to **{server}**, {user}! 🎉 You are member **#{count}**. Good to have you again!';

        const template = isReturningTest
          ? (guild.welcome?.returningMessage || defaultReturning)
          : (guild.welcome?.message || defaultWelcome);

        const welcomeEmbed = buildWelcomeEmbed(template, interaction.user, interaction.guild);
        await channel.send({ embeds: [welcomeEmbed] });

        const label = isReturningTest ? 'returning member' : 'new member';
        return interaction.editReply({
          embeds: [EmbedFactory.success('Test Sent', `A test **${label}** welcome message was sent to ${channel}.`)],
        });
      }

      if (sub === 'status') {
        const guild = await Guild.findOne({ guildId: interaction.guildId }).lean();
        const enabled = guild?.welcome?.enabled;
        const channelId = guild?.welcome?.channelId;
        const message = guild?.welcome?.message || '*(default)*';
        const returningEnabled = guild?.welcome?.returningEnabled;
        const returningMessage = guild?.welcome?.returningMessage || '*(default)*';

        const embed = EmbedFactory.base('👋 Welcome Configuration')
          .addFields(
            { name: '👋 Status', value: enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '👋 Channel', value: channelId ? `<#${channelId}>` : '*(not set)*', inline: true },
            { name: '👋 Message', value: message, inline: false },
            { name: '👋 Returning Status', value: returningEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '👋 Returning Message', value: returningMessage, inline: false },
            { name: '👋 Variables', value: '`{user}` — mention\n`{username}` — display name\n`{server}` — server name\n`{count}` — member count', inline: false },
          );

        return interaction.editReply({ embeds: [embed] });
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

function formatPreview(template, user, guild) {
  return template
    .replace(/{user}/g, user.toString())
    .replace(/{username}/g, user.displayName || user.username)
    .replace(/{server}/g, guild.name)
    .replace(/{count}/g, guild.memberCount?.toLocaleString() || '?');
}

function buildWelcomeEmbed(template, member, guild) {
  const { EmbedBuilder } = require('discord.js');
  const description = formatPreview(template, member, guild);

  return new EmbedBuilder()
    .setColor(0x00D4FF)
    .setTitle(`👋 Welcome to ${guild.name}!`)
    .setDescription(description)
    .setThumbnail(member.displayAvatarURL?.({ dynamic: true }) ?? member.avatarURL?.({ dynamic: true }) ?? null)
    .setFooter({ text: 'GoalX ⚽' })
    .setTimestamp();
}

