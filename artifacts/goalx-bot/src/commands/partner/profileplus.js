'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { requirePartner } = require('../../utils/partnerGuard');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profileplus')
    .setDescription('🤝 Partner-only: enhanced user profile with partner badge'),

  cooldown: 10,

  async execute(interaction, client) {
    try {
      if (!await requirePartner(interaction)) return;

      const userDoc = await User.findOne({ userId: interaction.user.id }).lean();
      const partnerSince = userDoc?.partnerSince
        ? `<t:${Math.floor(new Date(userDoc.partnerSince).getTime() / 1000)}:D>`
        : 'Now';

      const embed = EmbedFactory.base(`👤 **${interaction.user.username}** — Partner Profile`)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
          { name: '🏅 Partner Badge', value: '✅ Active GoalX Partner', inline: true },
          { name: '📅 Partner Since', value: partnerSince, inline: true },
          { name: '🪙 Coins', value: (userDoc?.coins || 0).toLocaleString(), inline: true },
          { name: '🏦 Bank', value: (userDoc?.bank || 0).toLocaleString(), inline: true },
          { name: '📊 Level', value: `${userDoc?.level || 1}`, inline: true },
          { name: '⭐ XP', value: `${userDoc?.xp || 0} / ${userDoc?.xpToNextLevel || 100}`, inline: true },
          { name: '🎲 Bets Won', value: `${userDoc?.betsWon || 0} / ${userDoc?.betsPlaced || 0}`, inline: true },
          { name: '💰 Total Earned', value: (userDoc?.totalEarned || 0).toLocaleString(), inline: true },
        )
        .setFooter({ text: '⚽ GoalX Partner · Profile Plus' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('refresh:profileplus').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
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
