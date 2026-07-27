'use strict';

const Guild = require('../models/Guild');
const { logger } = require('../utils/logger');

module.exports = {
  name: 'guildMemberRemove',
  once: false,
  async execute(member, client) {
    try {
      await Guild.findOneAndUpdate(
        { guildId: member.guild.id },
        { $addToSet: { leftMembers: member.id } },
        { upsert: true }
      );
    } catch (err) {
      logger.warn(`[guildMemberRemove] Failed to record ${member.id} in ${member.guild.id}: ${err.message}`);
    }
  },
};
