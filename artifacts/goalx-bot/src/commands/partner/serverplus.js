'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverplus')
    .setDescription('🤝 Partner-only: enhanced server football dashboard'),

  cooldown: 15,

  async execute(interaction, client) {
    try {
      if (!await requirePartner(interaction)) return;

      const guild = interaction.guild;
      if (!guild) {
        return interaction.reply({
          embeds: [EmbedFactory.error('Server Only', 'This command must be used in a server.')],
          flags: 64,
        });
      }

      const owner = await guild.fetchOwner().catch(() => null);
      const embed = EmbedFactory.base(`🏟️ **${guild.name}** — Partner Dashboard`)
        .setThumbnail(guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL())
        .addFields(
          { name: '👑 Owner', value: owner ? owner.user.tag : 'Unknown', inline: true },
          { name: '👥 Members', value: guild.memberCount.toLocaleString(), inline: true },
          { name: '🤖 Bots', value: guild.members.cache.filter((m) => m.user.bot).size.toLocaleString(), inline: true },
          { name: '💬 Text Channels', value: guild.channels.cache.filter((c) => c.isTextBased()).size.toLocaleString(), inline: true },
          { name: '🔊 Voice Channels', value: guild.channels.cache.filter((c) => c.isVoiceBased()).size.toLocaleString(), inline: true },
          { name: '🏷️ Roles', value: guild.roles.cache.size.toLocaleString(), inline: true },
          { name: '✨ Boosts', value: `${guild.premiumSubscriptionCount || 0} (Tier ${guild.premiumTier})`, inline: true },
          { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
          { name: '🆔 Server ID', value: guild.id, inline: true },
        )
        .setFooter({ text: '⚽ GoalX Partner · Server Plus' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('refresh:serverplus').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
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
