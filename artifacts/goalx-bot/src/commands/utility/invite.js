'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('🤖 Get the invite link for GoalX')
    .addSubcommand((sub) =>
      sub.setName('bot')
        .setDescription('🤖 Get the link to invite GoalX to a server')
    ),

  cooldown: 5,

  async execute(interaction, client) {
    try {
      const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot+applications.commands`;

      const embed = EmbedFactory.base('🤖 Invite GoalX')
        .setThumbnail(client.user.displayAvatarURL())
        .setDescription(
          'Add GoalX to your Discord server to get live football scores, stats, news, and more!\n\n' +
          `[**➕ Click here to Invite GoalX**](${inviteUrl})\n\n` +
          '[💬 Join Support Server](https://discord.gg/AHJ5Vr6FUC) · ' +
          '[⭐ Vote on Top.gg](https://top.gg/bot/goalx)'
        );

      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:invite')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({ embeds: [embed], ephemeral: true, components: [refreshRow] });
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
