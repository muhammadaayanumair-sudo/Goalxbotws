'use strict';

const { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const User = require('../../models/User');
const Guild = require('../../models/Guild');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('🛡️ Bot owner administration panel')
    .addSubcommand((sub) =>
      sub.setName('stats')
        .setDescription('🛡️ View bot-wide statistics')
    )
    .addSubcommand((sub) =>
      sub.setName('ban')
        .setDescription('🛡️ Ban a user from GoalX')
        .addUserOption((opt) => opt.setName('user').setDescription('🛡️ User to ban').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('🛡️ Ban reason').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName('unban')
        .setDescription('🛡️ Unban a user from GoalX')
        .addUserOption((opt) => opt.setName('user').setDescription('🛡️ User to unban').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('premium')
        .setDescription('🛡️ Grant premium to a guild')
        .addStringOption((opt) => opt.setName('guildid').setDescription('🛡️ Guild ID').setRequired(true))
        .addIntegerOption((opt) => opt.setName('days').setDescription('🛡️ Premium days').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('givecoins')
        .setDescription('🛡️ Give coins to a user')
        .addUserOption((opt) => opt.setName('user').setDescription('🛡️ Target user').setRequired(true))
        .addIntegerOption((opt) => opt.setName('amount').setDescription('🛡️ Amount of coins').setRequired(true))
    ),

  ownerOnly: true,
  cooldown: 3,

  async execute(interaction, client) {
  try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'stats') {
        const [totalUsers, totalGuilds, totalCards] = await Promise.all([
          User.countDocuments(),
          Guild.countDocuments(),
          require('../../models/Card').countDocuments(),
        ]);

        const uptimeMs = process.uptime() * 1000;
        const uptimeStr = [
          Math.floor(uptimeMs / 86400000) + 'd',
          Math.floor((uptimeMs % 86400000) / 3600000) + 'h',
          Math.floor((uptimeMs % 3600000) / 60000) + 'm',
        ].join(' ');

        const embed = EmbedFactory.base('🛡️ **GoalX Admin Stats**')
          .addFields(
            { name: '🛡️ Users', value: totalUsers.toLocaleString(), inline: true },
            { name: '🛡️ Guilds', value: totalGuilds.toLocaleString(), inline: true },
            { name: '🛡️ Cards', value: totalCards.toLocaleString(), inline: true },
            { name: '🛡️ Discord Guilds', value: client.guilds.cache.size.toLocaleString(), inline: true },
            { name: '🛡️ Uptime', value: uptimeStr, inline: true },
            { name: '🛡️ WS Ping', value: `${client.ws.ping}ms`, inline: true },
          );
                const helpRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('help:admin')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], ephemeral: true ,
          components: [helpRow]});
      }

      if (sub === 'ban') {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        await User.findOneAndUpdate(
          { userId: target.id },
          { $set: { banned: true, banReason: reason } },
          { upsert: true }
        );
        return interaction.reply({
          embeds: [EmbedFactory.success('User Banned', `**${target.tag}** has been banned from GoalX.\nReason: ${reason}`)],
          ephemeral: true,
        });
      }

      if (sub === 'unban') {
        const target = interaction.options.getUser('user');
        await User.findOneAndUpdate({ userId: target.id }, { $set: { banned: false, banReason: null } });
        return interaction.reply({
          embeds: [EmbedFactory.success('User Unbanned', `**${target.tag}** can now use GoalX again.`)],
          ephemeral: true,
        });
      }

      if (sub === 'premium') {
        const guildId = interaction.options.getString('guildid');
        const days = interaction.options.getInteger('days');
        const until = new Date(Date.now() + days * 86_400_000);
        await Guild.findOneAndUpdate(
          { guildId },
          { $set: { premium: true, premiumSince: new Date(), premiumUntil: until, premiumBy: interaction.user.id } },
          { upsert: true }
        );
        return interaction.reply({
          embeds: [EmbedFactory.success('Premium Granted', `Guild \`${guildId}\` now has premium for **${days} days** until <t:${Math.floor(until / 1000)}:D>.`)],
          ephemeral: true,
        });
      }

      if (sub === 'givecoins') {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const user = await User.findOneAndUpdate(
          { userId: target.id },
          { $inc: { coins: amount, totalEarned: amount } },
          { upsert: true, new: true }
        );
        return interaction.reply({
          embeds: [EmbedFactory.success('Coins Given', `Gave **${amount.toLocaleString()} coins** to **${target.tag}**.\nNew balance: ${user.coins.toLocaleString()}`)],
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
