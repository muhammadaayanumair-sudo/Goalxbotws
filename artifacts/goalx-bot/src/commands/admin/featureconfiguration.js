'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const {
  DEFAULT_INTRO_MESSAGE,
  buildChannelPreviewEmbed,
  formatPreview,
} = require('../../utils/featureConfig');
const Guild = require('../../models/Guild');
const { logger } = require('../../utils/logger');

const AUTO_CHANNELS = ['live', 'goals', 'news', 'transfers'];

const AUTO_LABELS = {
  live:      { label: 'Live Scores', interval: 'every 60 seconds during matches', pingText: 'live updates' },
  goals:     { label: 'Goals',       interval: 'when goals are scored',          pingText: 'every goal' },
  news:      { label: 'News',        interval: 'every 15 minutes',               pingText: 'breaking news' },
  transfers: { label: 'Transfers',   interval: 'every 2 hours',                  pingText: 'transfer alerts' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('feature-configuration')
    .setDescription('⚙️ Configure GoalX server features and channels')

    // Fabrizio Romano posts
    .addSubcommandGroup((group) =>
      group.setName('fabrizio-romano-posts')
        .setDescription('⚙️ Manage the Fabrizio Romano posts channel')
        .addSubcommand((sub) =>
          sub.setName('add')
            .setDescription('⚙️ Add a channel to receive Fabrizio Romano posts')
            .addChannelOption((opt) =>
              opt.setName('channel')
                .setDescription('⚙️ Channel to receive posts')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub.setName('remove')
            .setDescription('⚙️ Remove the Fabrizio Romano posts channel')
        )
    )

    // Intro DM
    .addSubcommand((sub) =>
      sub.setName('intro-dm')
        .setDescription('⚙️ Configure the intro DM sent to new members')
        .addBooleanOption((opt) =>
          opt.setName('enabled')
            .setDescription('⚙️ Turn the intro DM on or off')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('message')
            .setDescription('⚙️ Message text. Variables: {user} {username} {server}')
            .setRequired(false)
            .setMaxLength(1000)
        )
    )

    // Auto-post channels
    .addSubcommand((sub) =>
      sub.setName('live')
        .setDescription('🔴 Set the channel for live match score updates')
        .addChannelOption((opt) =>
          opt.setName('channel')
            .setDescription('🔴 Channel to post live scores in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt.setName('pingrole')
            .setDescription('🔴 Role to ping for live updates')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('goals')
        .setDescription('⚽ Set the channel for live goal notifications')
        .addChannelOption((opt) =>
          opt.setName('channel')
            .setDescription('⚽ Channel for goal alerts')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt.setName('pingrole')
            .setDescription('⚽ Role to ping on every goal (optional)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('news')
        .setDescription('📰 Set the channel for football news auto-posting')
        .addChannelOption((opt) =>
          opt.setName('channel')
            .setDescription('📰 Channel to post football news in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt.setName('pingrole')
            .setDescription('📰 Role to ping for breaking news (optional)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('transfers')
        .setDescription('🔄 Set the channel for transfer news auto-posting')
        .addChannelOption((opt) =>
          opt.setName('channel')
            .setDescription('🔄 Channel to post transfer news in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt.setName('pingrole')
            .setDescription('🔄 Role to ping for transfer alerts (optional)')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('fixtures')
        .setDescription('📅 Set the channel for daily fixture announcements')
        .addChannelOption((opt) =>
          opt.setName('channel')
            .setDescription('📅 Channel to post fixtures in (omit to disable)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )

    // Log channel
    .addSubcommand((sub) =>
      sub.setName('logs')
        .setDescription('📜 Set the channel for bot activity logs and owner broadcasts')
        .addChannelOption((opt) =>
          opt.setName('channel')
            .setDescription('📜 Channel to send bot logs in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  cooldown: 5,

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand();

      // ── Fabrizio Romano posts ───────────────────────────────────────────
      if (group === 'fabrizio-romano-posts') {
        if (sub === 'add') {
          const channel = interaction.options.getChannel('channel');
          await Guild.findOneAndUpdate(
            { guildId: interaction.guildId },
            {
              $set: {
                'features.fabrizioRomanoPosts.channelId': channel.id,
                'features.fabrizioRomanoPosts.enabled': true,
              },
            },
            { upsert: true }
          );
          return interaction.editReply({
            embeds: [EmbedFactory.success('Fabrizio Romano Posts', `Posts will be sent to ${channel}.`)],
          });
        }

        if (sub === 'remove') {
          await Guild.findOneAndUpdate(
            { guildId: interaction.guildId },
            {
              $set: {
                'features.fabrizioRomanoPosts.channelId': null,
                'features.fabrizioRomanoPosts.enabled': false,
              },
            },
            { upsert: true }
          );
          return interaction.editReply({
            embeds: [EmbedFactory.warning('Fabrizio Romano Posts', 'The Fabrizio Romano posts channel has been removed.')],
          });
        }
      }

      // ── Intro DM ─────────────────────────────────────────────────────────
      if (sub === 'intro-dm') {
        const enabled = interaction.options.getBoolean('enabled');
        const message = interaction.options.getString('message') || DEFAULT_INTRO_MESSAGE;

        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          {
            $set: {
              'features.introDm.enabled': enabled,
              'features.introDm.message': message,
            },
          },
          { upsert: true }
        );

        const status = enabled ? 'enabled' : 'disabled';
        return interaction.editReply({
          embeds: [
            EmbedFactory.success(
              'Intro DM Configuration',
              `Intro DM is now **${status}**.\n\n**Preview:**\n${formatPreview(message, interaction.user, interaction.guild)}`
            ),
          ],
        });
      }

      // ── Auto-post channels (live, goals, news, transfers) ───────────────
      if (AUTO_CHANNELS.includes(sub)) {
        return configureAutoChannel(interaction, sub);
      }

      // ── Fixtures ─────────────────────────────────────────────────────────
      if (sub === 'fixtures') {
        return configureFixtures(interaction);
      }

      // ── Log channel ──────────────────────────────────────────────────────
      if (sub === 'logs') {
        const channelId = interaction.options.getChannel('channel').id;

        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          { $set: { 'channels.log': channelId } },
          { upsert: true }
        );

        return interaction.editReply({
          embeds: [
            EmbedFactory.success(
              'Log Channel Set ✅',
              `<#${channelId}> is now set as this server's log channel.\n\n` +
              `*Used for: official bot announcements and owner broadcasts.*\n\n` +
              `Use \`/feature-configuration logs\` to change it.`
            ),
          ],
          components: [helpRow()],
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

async function configureAutoChannel(interaction, type) {
  const channel = interaction.options.getChannel('channel');
  const channelId = channel.id;
  const role = interaction.options.getRole('pingrole');
  const info = AUTO_LABELS[type];

  await Guild.findOneAndUpdate(
    { guildId: interaction.guildId },
    {
      $set: {
        [`channels.${type}.channelId`]: channelId,
        [`channels.${type}.enabled`]: true,
        [`channels.${type}.roleId`]: role?.id || null,
      },
    },
    { upsert: true }
  );

  // Try to send a preview message
  try {
    const target = await interaction.client.channels.fetch(channelId);
    const preview = buildChannelPreviewEmbed(type, role);
    if (preview) await target.send({ embeds: [preview] });
  } catch {
    return interaction.editReply({
      embeds: [EmbedFactory.warning(
        `${info.label} Channel Set — Check Permissions`,
        `Saved <#${channelId}> as the ${info.label.toLowerCase()} channel, but I couldn't send a test message there.\n` +
        'Please ensure I have **View Channel**, **Send Messages**, and **Embed Links** permissions in that channel.'
      )],
    });
  }

  await interaction.editReply({
    embeds: [
      EmbedFactory.success(
        `${info.label} Channel Set ✅`,
        `${info.label} posts will be sent in <#${channelId}> ${info.interval}.\n` +
        (role ? `Pinging ${role} on ${info.pingText}.\n` : '') +
        `A confirmation was sent there — check it now!\n\n` +
        `Use \`/removechannel type:${info.label}\` to unset, or \`/testdelivery\` to re-test anytime.`
      ),
    ],
    components: [helpRow()],
  });
}

async function configureFixtures(interaction) {
  const channel = interaction.options.getChannel('channel');
  const channelId = channel?.id || null;

  await Guild.findOneAndUpdate(
    { guildId: interaction.guildId },
    {
      $set: {
        'channels.fixtures.channelId': channelId,
        'channels.fixtures.enabled': Boolean(channel),
      },
    },
    { upsert: true }
  );

  if (!channel) {
    return interaction.editReply({
      embeds: [EmbedFactory.warning('Fixtures Disabled', 'Fixture announcements have been turned off.')],
      components: [helpRow()],
    });
  }

  try {
    const target = await interaction.client.channels.fetch(channelId);
    const preview = buildChannelPreviewEmbed('fixtures');
    if (preview) await target.send({ embeds: [preview] });
  } catch {
    return interaction.editReply({
      embeds: [EmbedFactory.warning(
        'Fixtures Channel Set — Check Permissions',
        `Saved <#${channelId}> as the fixtures channel, but I couldn't send a test message there.\n` +
        'Please make sure I have **Send Messages** and **Embed Links** permissions in that channel.'
      )],
    });
  }

  await interaction.editReply({
    embeds: [
      EmbedFactory.success(
        'Fixtures Channel Set ✅',
        `Daily fixture digests will be posted in ${channel}.\n` +
        `A confirmation message was sent there — check it now!\n\n` +
        `Use \`/feature-configuration fixtures\` (without a channel) to disable, or \`/testdelivery\` to re-test anytime.`
      ),
    ],
    components: [helpRow()],
  });
}

function helpRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help:feature-configuration')
      .setLabel('❓ Help')
      .setStyle(ButtonStyle.Secondary)
  );
}
