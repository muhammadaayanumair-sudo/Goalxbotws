'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const Guild = require('../../models/Guild');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Send a message to all servers (owner only)')
    .addStringOption((opt) =>
      opt.setName('message').setDescription('Message to broadcast').setRequired(true).setMaxLength(1500)
    )
    .addStringOption((opt) =>
      opt.setName('title').setDescription('Embed title').setRequired(false)
    ),

  ownerOnly: true,
  cooldown: 60,

  async execute(interaction, client) {
  try {
      await interaction.deferReply({ ephemeral: true });

      const message = interaction.options.getString('message');
      const title = interaction.options.getString('title') || '📢 GoalX Announcement';

      const guilds = await Guild.find({}).lean();
      let sent = 0, failed = 0;

      const embed = EmbedFactory.base(`**${title}**`)
        .setDescription(message)
        .setColor('#FF6B35')
        .setFooter({ text: '⚽ GoalX Official Announcement' });

      for (const guildData of guilds) {
        try {
          const guild = client.guilds.cache.get(guildData.guildId);
          if (!guild) continue;

          // Try to find a suitable channel to post in
          const channel = (
            (guildData.channels?.log ? guild.channels.cache.get(guildData.channels.log) : null) ||
            (guildData.channels?.news?.channelId ? guild.channels.cache.get(guildData.channels.news.channelId) : null) ||
            guild.channels.cache
              .filter((c) => c.isTextBased() && guild.members.me?.permissionsIn(c).has(['SendMessages', 'EmbedLinks']))
              .sort((a, b) => a.position - b.position)
              .first()
          );

          if (!channel) { failed++; continue; }

          await channel.send({ embeds: [embed] });
          sent++;
          await new Promise((r) => setTimeout(r, 250)); // Rate limit protection
        } catch (err) {
          failed++;
          logger.debug(`[Broadcast] Failed to send to guild ${guildData.guildId}: ${err.message}`);
        }
      }

      await interaction.editReply({
        embeds: [EmbedFactory.success('Broadcast Complete', `✅ Sent to **${sent}** servers\n❌ Failed for **${failed}** servers`)],
      });
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
