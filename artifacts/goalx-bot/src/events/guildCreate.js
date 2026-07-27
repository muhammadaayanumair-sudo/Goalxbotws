'use strict';

const { EmbedBuilder } = require('discord.js');
const { logger } = require('../utils/logger');
const Guild = require('../models/Guild');

// GoalX brand colour — matches PALETTE.brand in embed.js
const GOALX_COLOR = 0x00D4FF;

module.exports = {
  name: 'guildCreate',
  once: false,
  async execute(guild, client) {
    logger.info(`[Bot] Joined guild: ${guild.name} (${guild.id})`);

    // Persist guild record
    await Guild.findOneAndUpdate(
      { guildId: guild.id },
      {
        $setOnInsert: {
          guildId: guild.id,
          guildName: guild.name,
          ownerId: guild.ownerId,
          icon: guild.icon,
          memberCount: guild.memberCount,
        },
      },
      { upsert: true, new: true }
    ).catch((err) => logger.error('[guildCreate] DB error:', err.message));

    // ── Style the bot's managed integration role ──────────────────────────
    // Discord automatically creates a managed role named after the bot when
    // it joins. We colour and hoist it so it stands out like Carl-bot / MEE6.
    try {
      // Fetch full role list in case the cache isn't warm yet
      const roles = await guild.roles.fetch();
      const botRole = roles.find((r) => r.managed && r.name === client.user.username);

      if (botRole) {
        await botRole.edit({
          color: GOALX_COLOR,
          hoist: true,           // shows GoalX separately in the member list
          mentionable: false,    // integration roles shouldn't be mass-pinged
          reason: 'GoalX — automatic role setup on join',
        });
        logger.info(`[guildCreate] Styled managed role in ${guild.name}`);
      }
    } catch (err) {
      // Non-fatal — bot may lack Manage Roles permission in this guild
      logger.warn(`[guildCreate] Could not style managed role in ${guild.name}: ${err.message}`);
    }

    // ── Send a welcome embed to the system / first available channel ──────
    try {
      const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot+applications.commands`;

      const welcome = new EmbedBuilder()
        .setColor(GOALX_COLOR)
        .setAuthor({ name: 'GoalX', iconURL: client.user.displayAvatarURL() })
        .setTitle('⚽ Thanks for adding GoalX!')
        .setDescription(
          'GoalX is now live in **' + guild.name + '**. Here\'s how to get started:\n\n' +
          '**1️⃣ Set up your channels** — run these admin commands:\n' +
          '> `/feature-configuration live` — live scores every 60 s\n' +
          '> `/feature-configuration fixtures` — daily fixture lists\n' +
          '> `/feature-configuration news` — football news every 15 min\n' +
          '> `/feature-configuration transfers` — transfer alerts every 2 h\n' +
          '> `/feature-configuration goals` — goal notifications\n\n' +
          '**2️⃣ Explore commands** — use `/help` for the full list of 100+ slash commands.\n\n' +
          '**3️⃣ Share GoalX** — [invite it to another server](' + inviteUrl + ') or [join the support server](https://discord.gg/AHJ5Vr6FUC).\n\n' +
          '*The GoalX role has been created automatically and cannot be deleted — it manages the bot\'s permissions.*'
        )
        .setFooter({ text: '⚽ GoalX v1.9.0 · Football at your fingertips' })
        .setTimestamp();

      // Prefer the guild's designated system channel; fall back to the first
      // text channel the bot can actually write to.
      let target = guild.systemChannel;

      if (!target) {
        const channels = await guild.channels.fetch();
        target = channels.find(
          (c) =>
            c.isTextBased() &&
            !c.isThread() &&
            c.permissionsFor(client.user)?.has(['SendMessages', 'EmbedLinks'])
        );
      }

      if (target) {
        await target.send({ embeds: [welcome] });
        logger.info(`[guildCreate] Sent welcome to #${target.name} in ${guild.name}`);
      }
    } catch (err) {
      logger.warn(`[guildCreate] Could not send welcome in ${guild.name}: ${err.message}`);
    }
  },
};