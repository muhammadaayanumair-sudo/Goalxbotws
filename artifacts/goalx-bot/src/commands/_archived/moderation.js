'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const Log = require('../../models/Log');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation tools for server admins')
    .addSubcommand((sub) =>
      sub.setName('warn')
        .setDescription('Warn a user')
        .addUserOption((opt) => opt.setName('user').setDescription('User to warn').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for warning').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption((opt) => opt.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption((opt) => opt.setName('user').setDescription('User to ban').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false))
        .addIntegerOption((opt) => opt.setName('deletedays').setDescription('Days of messages to delete').setRequired(false).setMinValue(0).setMaxValue(7))
    )
    .addSubcommand((sub) =>
      sub.setName('timeout')
        .setDescription('Timeout a user')
        .addUserOption((opt) => opt.setName('user').setDescription('User to timeout').setRequired(true))
        .addIntegerOption((opt) => opt.setName('minutes').setDescription('Timeout duration in minutes').setRequired(true).setMinValue(1).setMaxValue(10080))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  cooldown: 3,

  async execute(interaction, client) {
  try {
      const sub = interaction.options.getSubcommand();
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = interaction.guild?.members.cache.get(target.id);

      await interaction.deferReply({ ephemeral: true });

      if (!member) return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', 'Member not found in this server.')] });
      if (member.id === interaction.user.id) return interaction.editReply({ embeds: [EmbedFactory.error('Error', 'You cannot moderate yourself.')] });
      if (member.roles.highest.position >= interaction.member.roles.highest.position) {
        return interaction.editReply({ embeds: [EmbedFactory.error('Hierarchy Error', 'You cannot moderate someone with a higher or equal role.')] });
      }

      try {
        if (sub === 'warn') {
          await Log.create({ guildId: interaction.guildId, userId: target.id, type: 'moderation', action: 'warn', details: { reason, moderator: interaction.user.id } });
          try { await target.send({ embeds: [EmbedFactory.warning(`Warning in ${interaction.guild.name}`, `You have been warned.\n**Reason:** ${reason}`)] }); } catch {}
          return interaction.editReply({ embeds: [EmbedFactory.success('User Warned', `**${target.tag}** has been warned.\n**Reason:** ${reason}`)] });
        }

        if (sub === 'kick') {
          if (!member.kickable) return interaction.editReply({ embeds: [EmbedFactory.error('Cannot Kick', 'I cannot kick this user.')] });
          await member.kick(reason);
          await Log.create({ guildId: interaction.guildId, userId: target.id, type: 'moderation', action: 'kick', details: { reason } });
          return interaction.editReply({ embeds: [EmbedFactory.success('User Kicked', `**${target.tag}** has been kicked.\n**Reason:** ${reason}`)] });
        }

        if (sub === 'ban') {
          if (!member.bannable) return interaction.editReply({ embeds: [EmbedFactory.error('Cannot Ban', 'I cannot ban this user.')] });
          const deleteMessageSeconds = (interaction.options.getInteger('deletedays') || 0) * 86400;
          await member.ban({ reason, deleteMessageSeconds });
          await Log.create({ guildId: interaction.guildId, userId: target.id, type: 'moderation', action: 'ban', details: { reason } });
          return interaction.editReply({ embeds: [EmbedFactory.success('User Banned', `**${target.tag}** has been banned.\n**Reason:** ${reason}`)] });
        }

        if (sub === 'timeout') {
          if (!member.moderatable) return interaction.editReply({ embeds: [EmbedFactory.error('Cannot Timeout', 'I cannot timeout this user.')] });
          const minutes = interaction.options.getInteger('minutes');
          await member.timeout(minutes * 60_000, reason);
          await Log.create({ guildId: interaction.guildId, userId: target.id, type: 'moderation', action: 'timeout', details: { reason, minutes } });
          return interaction.editReply({ embeds: [EmbedFactory.success('User Timed Out', `**${target.tag}** has been timed out for **${minutes} minutes**.\n**Reason:** ${reason}`)] });
        }
      } catch (err) {
        return interaction.editReply({ embeds: [EmbedFactory.error('Action Failed', err.message)] });
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
