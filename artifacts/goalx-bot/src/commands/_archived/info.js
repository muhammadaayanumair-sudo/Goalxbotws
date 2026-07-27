'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatNumber } = require('../../utils/formatters');
const os = require('os');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('View GoalX bot information and statistics'),

  cooldown: 10,

  async execute(interaction, client) {
    const memUsage = process.memoryUsage();
    const memMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
    const totalUsers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);

    const embed = EmbedFactory.base('ℹ️ **GoalX Bot Info**')
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        {
          name: '🤖 Bot',
          value: [
            `**Name:** ${client.user.tag}`,
            `**Version:** v1.0.0`,
            `**Library:** Discord.js v14`,
            `**Node.js:** ${process.version}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '📊 Stats',
          value: [
            `**Servers:** ${formatNumber(client.guilds.cache.size)}`,
            `**Users:** ${formatNumber(totalUsers)}`,
            `**Commands:** ${client.commands.size}`,
            `**Uptime:** ${client.getUptime?.() || 'N/A'}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '⚙️ System',
          value: [
            `**RAM:** ${memMB}MB`,
            `**CPU:** ${os.cpus()[0]?.model?.split(' ').slice(0, 3).join(' ')}`,
            `**OS:** ${os.type()} ${os.arch()}`,
            `**Ping:** ${client.ws.ping}ms`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '🔗 Links',
          value: [
            '[🤖 Invite GoalX](https://discord.com/oauth2/authorize)',
            '[💬 Support Server](https://discord.gg/goalx)',
            '[⭐ Vote on Top.gg](https://top.gg/bot/goalx)',
            '[📖 Documentation](https://goalx.bot/docs)',
          ].join(' · '),
          inline: false,
        }
      )
      .setFooter({ text: 'GoalX • The #1 Football Discord Bot' });

    await interaction.reply({ embeds: [embed] });
  },
};
