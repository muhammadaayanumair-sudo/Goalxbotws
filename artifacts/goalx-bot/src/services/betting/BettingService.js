'use strict';

const { logger } = require('../../utils/logger');

class BettingService {
  static async resolveMatchBets(matchId, result) {
    logger.info(`[BettingService] Resolving bets for match ${matchId}`);
    return 0;
  }
}

module.exports = { BettingService };
