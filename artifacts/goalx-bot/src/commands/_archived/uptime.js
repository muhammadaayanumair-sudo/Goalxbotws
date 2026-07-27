'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const os = require('os');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('View GoalX\'s uptime and system health'),

  cooldown: 10,

  async execute(interaction, client) {
    const memUsage = process.memoryUsage();
    const heapMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
    const rss = (memUsage.rss / 1024 / 1024).toFixed(1);
    const osUptime = Math.floor(os.uptime() / 3600);

    const embed = EmbedFactory.success('⏱️ System Status')
      .setDescription('GoalX is running smoothly!')
      .addFields(
        { name: '🤖 Bot Uptime', value: client.getUptime?.() || 'N/A', inline: true },
        { name: '🖥️ Server Uptime', value: `${osUptime}h`, inline: true },
        { name: '📡 WS Ping', value: `${client.ws.ping}ms`, inline: true },
        { name: '💾 Heap Used', value: `${heapMB} MB`, inline: true },
        { name: '💿 RSS Memory', value: `${rss} MB`, inline: true },
        { name: '⚙️ Node.js', value: process.version, inline: true },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
