'use strict';

const { EmbedBuilder } = require('discord.js');
const { logger } = require('../utils/logger');
const Guild = require('../models/Guild');
const User = require('../models/User');

module.exports = {
  name: 'guildMemberAdd',
  once: false,
  async execute(member, client) {
    // Upsert user in DB so they're ready when they run commands
    await User.findOneAndUpdate(
      { userId: member.id },
      {
        $setOnInsert: {
          userId: member.id,
          username: member.user.username,
          avatar: member.user.avatar,
        },
        $set: {
          username: member.user.username,
          avatar: member.user.avatar,
        },
      },
      { upsert: true, new: true }
    ).catch(() => {});

    // Fetch guild config
    const guildDoc = await Guild.findOne({ guildId: member.guild.id }).lean().catch(() => null);

    // ── Welcome channel message ───────────────────────────────────────────
    if (guildDoc?.welcome?.enabled && guildDoc?.welcome?.channelId) {
      const channel = member.guild.channels.cache.get(guildDoc.welcome.channelId);
      if (channel) {
        const isReturning = guildDoc.leftMembers?.includes(member.id);
        const defaultWelcome = 'Welcome to **{server}**, {user}! 🎉 You are member **#{count}**. Enjoy the football talk and use `/help` to see all GoalX commands!';
        const defaultReturning = 'Welcome back to **{server}**, {user}! 🎉 You are member **#{count}**. Good to have you again!';

        let template = defaultWelcome;
        if (isReturning && guildDoc.welcome?.returningEnabled) {
          template = guildDoc.welcome.returningMessage || defaultReturning;
        } else if (guildDoc.welcome?.message) {
          template = guildDoc.welcome.message;
        }

        const description = template
          .replace(/{user}/g, member.toString())
          .replace(/{username}/g, member.displayName || member.user.username)
          .replace(/{server}/g, member.guild.name)
          .replace(/{count}/g, member.guild.memberCount?.toLocaleString() || '?');

        const embed = new EmbedBuilder()
          .setColor(0x00D4FF)
          .setTitle(`👋 Welcome to ${member.guild.name}!`)
          .setDescription(description)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: 'GoalX ⚽' })
          .setTimestamp();

        await channel.send({ embeds: [embed] }).catch((err) => {
          logger.warn(`[guildMemberAdd] Failed to send welcome in ${member.guild.name}: ${err.message}`);
        });
      }
    }

    // ── Intro DM ──────────────────────────────────────────────────────────
    if (guildDoc?.features?.introDm?.enabled) {
      const defaultIntro = 'Hey {user}, welcome to **{server}**! 🎉 I\'m GoalX, your football companion. Use `/help` to see what I can do.';
      const template = guildDoc.features.introDm.message || defaultIntro;
      const text = template
        .replace(/{user}/g, member.toString())
        .replace(/{username}/g, member.displayName || member.user.username)
        .replace(/{server}/g, member.guild.name);

      await member.send(text).catch((err) => {
        logger.warn(`[guildMemberAdd] Failed to send intro DM to ${member.id}: ${err.message}`);
      });
    }
  },
};
