'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory }  = require('../../utils/embed');
const { formatCoins }   = require('../../utils/formatters');
const User              = require('../../models/User');
const Guild             = require('../../models/Guild');
const { logger } = require('../../utils/logger');

// ─── Shared owner guard (belt-and-suspenders on top of InteractionHandler) ───
function isOwner(userId) {
  return userId === process.env.BOT_OWNER_ID;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botadmin')
    .setDescription('🔧 Bot owner control panel — restricted to owner only')

    // ── SET LOG CHANNEL ────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('set-log-channel')
        .setDescription('🔧 Set the admin log channel for this server')
        .addChannelOption((o) =>
          o.setName('channel')
            .setDescription('🔧 Text channel to receive bot admin logs')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )

    // ── BLACKLIST ADD ──────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('blacklist-add')
        .setDescription('🔧 Blacklist a user from using the bot globally')
        .addUserOption((o) =>
          o.setName('user').setDescription('🔧 User to blacklist').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('🔧 Reason for blacklist').setRequired(false)
        )
    )

    // ── BLACKLIST REMOVE ───────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('blacklist-remove')
        .setDescription('🔧 Remove a user from the global blacklist')
        .addUserOption((o) =>
          o.setName('user').setDescription('🔧 User to un-blacklist').setRequired(true)
        )
    )

    // ── BLACKLIST LIST ─────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('blacklist-list')
        .setDescription('🔧 View all globally blacklisted users')
    )

    // ── BLACKLIST GUILD ────────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('blacklist-guild')
        .setDescription('🔧 Blacklist or un-blacklist an entire guild from using the bot')
        .addStringOption((o) =>
          o.setName('guild_id').setDescription('🔧 Guild ID to blacklist/un-blacklist').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('action')
            .setDescription('🔧 Add or remove from blacklist')
            .setRequired(true)
            .addChoices(
              { name: '🔧 Add to blacklist', value: 'add' },
              { name: '🔧 Remove from blacklist', value: 'remove' },
            )
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('🔧 Reason (for add)').setRequired(false)
        )
    ),

  ownerOnly: true,
  cooldown: 2,

  async execute(interaction, client) {
  try {
      await interaction.deferReply({ ephemeral: true });

      if (!isOwner(interaction.user.id)) {
                const helpRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('help:botadmin')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.editReply({ embeds: [EmbedFactory.error('🔒 Owner only.')] ,
          components: [helpRow]});
      }

      const sub     = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      // ── SET LOG CHANNEL ────────────────────────────────────────────────────
      if (sub === 'set-log-channel') {
        const channel = interaction.options.getChannel('channel');

        await Guild.findOneAndUpdate(
          { guildId },
          { $set: { 'channels.log': channel.id } },
          { upsert: true, new: true }
        );

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00D4FF')
              .setTitle('✅ Log Channel Set')
              .setDescription(`Admin logs for this server will now be sent to ${channel}.`)
              .setFooter({ text: 'GoalX BotAdmin' })
              .setTimestamp(),
          ],
        });
      }

      // ── BLACKLIST ADD ──────────────────────────────────────────────────────
      if (sub === 'blacklist-add') {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (target.id === process.env.BOT_OWNER_ID) {
          return interaction.editReply({ embeds: [EmbedFactory.error("You can't blacklist yourself.")] });
        }

        const user = await User.findOneAndUpdate(
          { userId: target.id },
          { $set: { banned: true, banReason: reason } },
          { upsert: true, new: true }
        );

        // Try to DM the blacklisted user
        try {
          await target.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#FF4444')
                .setTitle('🚫 You have been blacklisted from GoalX')
                .addFields({ name: '🔧 Reason', value: reason })
                .setFooter({ text: 'GoalX Bot Admin' }),
            ],
          });
        } catch (_) { /* DMs closed — that's fine */ }

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#FF4444')
              .setTitle('🚫 User Blacklisted')
              .addFields(
                { name: '🔧 User',   value: `${target.tag} (${target.id})`, inline: true },
                { name: '🔧 Reason', value: reason },
              )
              .setFooter({ text: 'GoalX BotAdmin' })
              .setTimestamp(),
          ],
        });
      }

      // ── BLACKLIST REMOVE ───────────────────────────────────────────────────
      if (sub === 'blacklist-remove') {
        const target = interaction.options.getUser('user');

        const user = await User.findOneAndUpdate(
          { userId: target.id },
          { $set: { banned: false, banReason: null } },
          { new: true }
        );

        if (!user) {
          return interaction.editReply({ embeds: [EmbedFactory.error(`No record found for **${target.tag}**.`)] });
        }

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#44FF88')
              .setTitle('✅ User Un-Blacklisted')
              .setDescription(`**${target.tag}** (${target.id}) can now use the bot again.`)
              .setFooter({ text: 'GoalX BotAdmin' })
              .setTimestamp(),
          ],
        });
      }

      // ── BLACKLIST LIST ─────────────────────────────────────────────────────
      if (sub === 'blacklist-list') {
        const bannedUsers = await User.find({ banned: true }).select('userId username banReason').limit(25).lean();

        if (!bannedUsers.length) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#44FF88')
                .setTitle('✅ Blacklist — Clear')
                .setDescription('🔧 No users are currently blacklisted.')
                .setFooter({ text: 'GoalX BotAdmin' }),
            ],
          });
        }

        const rows = bannedUsers.map((u, i) =>
          `**${i + 1}.** ${u.username ?? 'Unknown'} (\`${u.userId}\`) — ${u.banReason || 'No reason'}`
        ).join('\n');

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#FF4444')
              .setTitle(`🚫 Blacklisted Users (${bannedUsers.length})`)
              .setDescription(rows)
              .setFooter({ text: 'GoalX BotAdmin · /botadmin blacklist-remove to un-ban' })
              .setTimestamp(),
          ],
        });
      }

      // ── BLACKLIST GUILD ────────────────────────────────────────────────────
      if (sub === 'blacklist-guild') {
        const targetGuildId = interaction.options.getString('guild_id').trim();
        const action        = interaction.options.getString('action');
        const reason        = interaction.options.getString('reason') || 'No reason provided';

        if (action === 'add') {
          await Guild.findOneAndUpdate(
            { guildId: targetGuildId },
            { $set: { blacklisted: true, blacklistReason: reason } },
            { upsert: true, new: true }
          );

          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#FF4444')
                .setTitle('🚫 Guild Blacklisted')
                .addFields(
                  { name: '🔧 Guild ID', value: targetGuildId, inline: true },
                  { name: '🔧 Reason',   value: reason },
                )
                .setFooter({ text: 'GoalX BotAdmin' })
                .setTimestamp(),
            ],
          });
        }

        if (action === 'remove') {
          await Guild.findOneAndUpdate(
            { guildId: targetGuildId },
            { $set: { blacklisted: false, blacklistReason: null } },
            { new: true }
          );

          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#44FF88')
                .setTitle('✅ Guild Un-Blacklisted')
                .setDescription(`Guild \`${targetGuildId}\` can now use the bot again.`)
                .setFooter({ text: 'GoalX BotAdmin' })
                .setTimestamp(),
            ],
          });
        }
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
