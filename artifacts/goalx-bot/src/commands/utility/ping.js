'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const mongoose = require('mongoose');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('🏓 Check GoalX\'s latency and status'),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const start = Date.now();
      await interaction.deferReply();
      const apiLatency = Date.now() - start;

      const dbState = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'];
      const dbStatus = dbState[mongoose.connection.readyState] || 'Unknown';
      const cacheStatus = client.cache?.useRedis ? 'Redis ✅' : 'In-Memory ⚡';

      const embed = EmbedFactory.success('Pong! 🏓')
        .setDescription([
          `**Bot Latency:** ${apiLatency}ms`,
          `**WebSocket:** ${client.ws.ping}ms`,
          `**Database:** ${dbStatus} ${dbStatus === 'Connected' ? '✅' : '❌'}`,
          `**Cache:** ${cacheStatus}`,
          `**Uptime:** ${client.getUptime?.() || 'N/A'}`,
          `**Guilds:** ${client.guilds.cache.size.toLocaleString()}`,
          `**Commands:** ${client.commands.size}`,
        ].join('\n'));

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:ping')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.editReply({ embeds: [embed] ,
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
