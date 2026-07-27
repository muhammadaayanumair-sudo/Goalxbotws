'use strict';

const { CronJob } = require('cron');
const { MatchdayEngine } = require('./MatchdayEngine');
const { MatchdaySummaryScheduler } = require('./MatchdaySummaryScheduler');
const { FixtureScheduler } = require('./FixtureScheduler');
const { NewsScheduler } = require('./NewsScheduler');
const { TransferScheduler } = require('./TransferScheduler');
const { FabrizioRomanoScheduler } = require('./FabrizioRomanoScheduler');
const { BetResolutionScheduler } = require('./BetResolutionScheduler');
const { AuctionScheduler } = require('./AuctionScheduler');
const { CleanupScheduler } = require('./CleanupScheduler');
const config = require('../config/config');
const { logger } = require('../utils/logger');

/**
 * SchedulerManager starts and manages all cron-based background jobs.
 * Scheduler instances are created ONCE and reused — this is required so
 * stateful schedulers (e.g. NewsScheduler's dedup set) persist between ticks.
 */
class SchedulerManager {
  constructor(client) {
    this.client = client;
    this.jobs = [];
  }

  async startAll() {
    logger.info('[Scheduler] Starting all scheduled jobs...');

    const skipFootball = process.env.FOOTBALL_SCHEDULERS_DISABLED === 'true';
    if (skipFootball) {
      logger.warn('[Scheduler] FOOTBALL_SCHEDULERS_DISABLED=true — skipping Matchday Engine, Matchday Summary, and Fixtures schedulers (API rate limit cooldown).');
    }

    // Create instances once — do not use `new X()` inside the tick callback
    const newsScheduler             = new NewsScheduler(this.client);
    const transferScheduler         = new TransferScheduler(this.client);
    const fabrizioRomanoScheduler   = new FabrizioRomanoScheduler(this.client);
    const betResolutionScheduler    = new BetResolutionScheduler(this.client);
    const auctionScheduler      = new AuctionScheduler(this.client);
    const cleanupScheduler      = new CleanupScheduler(this.client);

    if (!skipFootball) {
      const matchdayEngine    = new MatchdayEngine(this.client);
      const matchdaySummary   = new MatchdaySummaryScheduler(this.client);
      const fixtureScheduler  = new FixtureScheduler(this.client);
      // Matchday engine runs every minute to detect live events.
      this._register('Matchday Engine', config.scheduler.liveScoreInterval, () => matchdayEngine.run());
      // Daily digest at 09:00 UTC. Guilds can override later via dashboard.
      this._register('Matchday Summary', '0 9 * * *', () => matchdaySummary.run());
      this._register('Fixtures', config.scheduler.fixtureInterval, () => fixtureScheduler.run());
    }

    this._register('News',                  config.scheduler.newsInterval,            () => newsScheduler.run());
    this._register('Transfers',             config.scheduler.transferInterval,        () => transferScheduler.run());
    this._register('Fabrizio Romano Posts', config.scheduler.fabrizioRomanoInterval,   () => fabrizioRomanoScheduler.run());
    this._register('Bet Resolution',  '*/5 * * * *', () => betResolutionScheduler.run());
    this._register('Auction Resolution', '*/2 * * * *', () => auctionScheduler.run());
    this._register('Cleanup',     config.scheduler.cleanupInterval,   () => cleanupScheduler.run());

    logger.info(`[Scheduler] ${this.jobs.length} jobs active`);
  }

  _register(name, cronExpression, handler) {
    const job = new CronJob(
      cronExpression,
      async () => {
        try {
          await handler();
        } catch (err) {
          logger.error(`[Scheduler] Error in "${name}" job:`, err.message);
        }
      },
      null,
      true,
      'UTC'
    );

    this.jobs.push({ name, job });
    logger.debug(`[Scheduler] Registered job: ${name} (${cronExpression})`);
  }

  stopAll() {
    for (const { name, job } of this.jobs) {
      job.stop();
      logger.debug(`[Scheduler] Stopped job: ${name}`);
    }
    this.jobs = [];
  }
}

module.exports = { SchedulerManager };
