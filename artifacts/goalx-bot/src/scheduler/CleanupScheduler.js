'use strict';

const Log = require('../models/Log');
const Bet = require('../models/Bet');
const Trade = require('../models/Trade');
const { logger } = require('../utils/logger');

/**
 * CleanupScheduler runs nightly to remove stale data from the database.
 */
class CleanupScheduler {
  constructor(client) {
    this.client = client;
  }

  async run() {
    logger.info('[CleanupScheduler] Starting nightly cleanup...');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

    try {
      // Remove old resolved bets
      const betsResult = await Bet.deleteMany({
        status: { $in: ['won', 'lost', 'void'] },
        resolvedAt: { $lte: thirtyDaysAgo },
      });

      // Remove expired/cancelled trades
      const tradesResult = await Trade.deleteMany({
        status: { $in: ['expired', 'cancelled', 'rejected'] },
        updatedAt: { $lte: sevenDaysAgo },
      });

      // Expire old pending trades
      const expiredTrades = await Trade.updateMany(
        { status: 'pending', expiresAt: { $lte: new Date() } },
        { $set: { status: 'expired' } }
      );

      logger.info(
        `[CleanupScheduler] Cleanup complete. ` +
        `Bets removed: ${betsResult.deletedCount} | ` +
        `Trades removed: ${tradesResult.deletedCount} | ` +
        `Trades expired: ${expiredTrades.modifiedCount}`
      );
    } catch (err) {
      logger.error('[CleanupScheduler] Cleanup error:', err.message);
    }
  }
}

module.exports = { CleanupScheduler };
