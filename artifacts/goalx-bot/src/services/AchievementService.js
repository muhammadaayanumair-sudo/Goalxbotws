'use strict';

const { logger } = require('../utils/logger');

class AchievementService {
  static async checkAndAward(userId) {
    logger.debug(`[AchievementService] checkAndAward(${userId})`);
    return [];
  }

  static async getStatus(userId) {
    logger.debug(`[AchievementService] getStatus(${userId})`);
    return [];
  }
}

module.exports = { AchievementService };
