'use strict';

const { Collection } = require('discord.js');

/**
 * CooldownManager handles per-user, per-command cooldowns using in-memory Collections.
 */
class CooldownManager {
  constructor() {
    /** @type {Collection<string, Collection<string, number>>} */
    this.cooldowns = new Collection();
  }

  /**
   * Checks if a user is on cooldown for a given command.
   * Returns remaining time in seconds if on cooldown, or 0 if free.
   *
   * @param {string} commandName
   * @param {string} userId
   * @param {number} cooldownSeconds
   * @returns {number} remaining cooldown in seconds
   */
  check(commandName, userId, cooldownSeconds) {
    if (!this.cooldowns.has(commandName)) {
      this.cooldowns.set(commandName, new Collection());
    }

    const now = Date.now();
    const timestamps = this.cooldowns.get(commandName);
    const cooldownMs = cooldownSeconds * 1000;

    if (timestamps.has(userId)) {
      const expiresAt = timestamps.get(userId) + cooldownMs;
      if (now < expiresAt) {
        return Math.ceil((expiresAt - now) / 1000);
      }
    }

    return 0;
  }

  /**
   * Sets the cooldown timestamp for a user on a command.
   *
   * @param {string} commandName
   * @param {string} userId
   */
  set(commandName, userId) {
    if (!this.cooldowns.has(commandName)) {
      this.cooldowns.set(commandName, new Collection());
    }
    const timestamps = this.cooldowns.get(commandName);
    timestamps.set(userId, Date.now());

    // Auto-clean after the max reasonable cooldown (1 day)
    setTimeout(() => timestamps.delete(userId), 86_400_000);
  }

  /**
   * Clears a specific user's cooldown for a command.
   */
  clear(commandName, userId) {
    if (this.cooldowns.has(commandName)) {
      this.cooldowns.get(commandName).delete(userId);
    }
  }
}

module.exports = { CooldownManager };