'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('🗳️ Vote for GoalX on Top.gg and earn bonus GoalCoins'),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const embed = EmbedFactory.base('⭐ Vote for GoalX')
        .setDescription(
          'Support GoalX by voting on Top.gg! Every vote earns you bonus GoalCoins.\n\n' +
          '**[⭐ Vote Now on Top.gg](https://top.gg/bot/goalx/vote)**\n\n' +
          '**Vote Rewards:**\n' +
          `• First vote: ${formatCoins(500)}\n` +
          `• Weekend vote (2x): ${formatCoins(1000)}\n` +
          `• Streak bonus (7 days): ${formatCoins(2500)} + 🃏 Premium Pack\n\n` +
          '*Rewards are credited automatically after voting.*'
        )
        .setFooter({ text: 'GoalX • Thank you for your support!' });

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:vote')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.reply({ embeds: [embed], ephemeral: true ,
        components: [refreshRow]});
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
