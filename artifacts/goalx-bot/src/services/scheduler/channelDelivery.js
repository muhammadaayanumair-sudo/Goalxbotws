'use strict';

const { logger } = require('../utils/logger');

/**
 * Attempts to fetch a channel and verify the bot can actually post in it.
 * Every failure reason is logged at .warn() (always visible, unlike .debug()
 * which Winston silently drops unless LOG_LEVEL=debug is explicitly set).
 *
 * Returns the channel object if postable, or null if not — callers should
 * skip that guild on null without needing to log anything themselves.
 *
 * @param {import('discord.js').Client} client
 * @param {string} channelId
 * @param {string} guildId - for logging context only
 * @param {string} schedulerName - e.g. 'FixtureScheduler', for logging context
 * @returns {Promise<import('discord.js').TextBasedChannel|null>}
 */
async function resolvePostableChannel(client, channelId, guildId, schedulerName) {
  if (!channelId) {
    logger.warn(`[${schedulerName}] Guild ${guildId} has no channel ID configured — skipping.`);
    return null;
  }

  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (err) {
    // Most common real-world cause: channel was deleted, or bot was removed
    // from the guild and re-added (Discord invalidates the old channel cache).
    logger.warn(
      `[${schedulerName}] Could not fetch channel ${channelId} in guild ${guildId}: ${err.message}. ` +
      `The channel may have been deleted — re-run the /set*channel command to fix this.`
    );
    return null;
  }

  if (!channel) {
    logger.warn(`[${schedulerName}] Channel ${channelId} in guild ${guildId} returned null (likely deleted).`);
    return null;
  }

  if (!channel.isTextBased()) {
    logger.warn(`[${schedulerName}] Channel ${channelId} in guild ${guildId} is not a text channel — skipping.`);
    return null;
  }

  const me = channel.guild?.members?.me;
  if (!me) {
    logger.warn(`[${schedulerName}] Could not resolve bot member in guild ${guildId} — skipping.`);
    return null;
  }

  const perms = channel.permissionsFor(me);
  const required = ['ViewChannel', 'SendMessages', 'EmbedLinks'];
  const missing = required.filter((p) => !perms?.has(p));

  if (missing.length > 0) {
    logger.warn(
      `[${schedulerName}] Missing permissions [${missing.join(', ')}] in #${channel.name} ` +
      `(guild ${guildId}). Grant these to the bot's role in that channel.`
    );
    return null;
  }

  return channel;
}

/**
 * Sends a payload to a channel, logging any send failure visibly instead
 * of silently swallowing it. Returns true on success, false on failure.
 *
 * @param {import('discord.js').TextBasedChannel} channel
 * @param {object} payload - the { embeds, content, ... } object to send
 * @param {string} guildId - for logging context
 * @param {string} schedulerName - for logging context
 * @returns {Promise<boolean>}
 */
async function sendSafely(channel, payload, guildId, schedulerName) {
  try {
    await channel.send(payload);
    return true;
  } catch (err) {
    logger.warn(`[${schedulerName}] Failed to send message in guild ${guildId} (#${channel.name}): ${err.message}`);
    return false;
  }
}

module.exports = { resolvePostableChannel, sendSafely };
