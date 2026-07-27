'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { progressBar } = require('../../utils/formatters');
const { AchievementService } = require('../../services/AchievementService');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('🏅 View your achievement collection and track your progress')
    .addUserOption((o) => o
      .setName('user')
      .setDescription('View another user\'s achievements')
      .setRequired(false)),

  cooldown: 10,

  async execute(interaction, client) {
    try {
      await interaction.deferReply();

      const target = interaction.options.getUser('user') || interaction.user;
      const isSelf = target.id === interaction.user.id;

      // Check and award any new achievements for self
      let newlyAwarded = [];
      if (isSelf) {
        newlyAwarded = await AchievementService.checkAndAward(target.id);
      }

      const allAch = await AchievementService.getStatus(target.id);
      const earned = allAch.filter((a) => a.earned);
      const locked = allAch.filter((a) => !a.earned);
      const total  = allAch.length;
      const bar    = progressBar(earned.length, total, 14);

      // Group earned by category (last word of name for display)
      const earnedLines = earned.map((a) =>
        `${a.emoji} **${a.name}** — ${a.desc}`
      );
      const lockedLines = locked.map((a) =>
        `🔒 ~~${a.name}~~ — ${a.desc}`
      );

      const embed = EmbedFactory.base(`🏅 ${target.username}'s Achievements`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setDescription([
          `**${earned.length} / ${total} unlocked**`,
          `\`${bar}\``,
          '',
          earned.length > 0
            ? `**✅ Unlocked (${earned.length})**\n${earnedLines.join('\n')}`
            : '*No achievements unlocked yet.*',
        ].join('\n'))
        .setFooter({ text: `⚽ Powered by GoalX · Each achievement awards +100 XP` });

      if (locked.length > 0) {
        embed.addFields({
          name: `🔒 Locked (${locked.length})`,
          value: lockedLines.slice(0, 10).join('\n') + (lockedLines.length > 10 ? `\n*…and ${lockedLines.length - 10} more*` : ''),
          inline: false,
        });
      }

      if (newlyAwarded.length > 0) {
        embed.addFields({
          name: '🎉 Just Unlocked!',
          value: newlyAwarded.map((a) => `${a.emoji} **${a.name}** — ${a.desc} *(+100 XP)*`).join('\n'),
          inline: false,
        });
      }

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:achievements')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.editReply({ embeds: [embed] ,
        components: [refreshRow]});
    } catch (error) {
      logger.error('[achievements] execute error:', error);
      const msg = { embeds: [EmbedFactory.error('Something went wrong', error.message || 'Unexpected error.')], flags: 64 };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
