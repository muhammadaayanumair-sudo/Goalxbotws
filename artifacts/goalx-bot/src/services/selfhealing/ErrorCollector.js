'use strict';

const { logger } = require('../../utils/logger');

/**
 * ErrorCollector — singleton that captures runtime errors with full context.
 *
 * Maintains a circular buffer of the last MAX_ERRORS errors.
 * Each entry includes: id, timestamp, type, message, stack, command context,
 * guild/user identifiers, and resolution status.
 *
 * Attached to process global error handlers in index.js.
 */
class ErrorCollector {
  constructor({ maxErrors = 50 } = {}) {
    this.maxErrors = maxErrors;
    this.errors = []; // circular buffer
    this._nextId = 1;
  }

  /**
   * Capture an error with optional metadata.
   * @param {Error} err
   * @param {Object} ctx - { type, command, userId, guildId, extra }
   * @returns {string} error ID
   */
  capture(err, ctx = {}) {
    const id = `ERR-${String(this._nextId++).padStart(4, '0')}`;
    const entry = {
      id,
      timestamp: new Date().toISOString(),
      type: ctx.type || 'uncaught',
      message: err?.message || String(err),
      stack: err?.stack || null,
      code: err?.code || null,
      command: ctx.command || null,
      userId: ctx.userId || null,
      guildId: ctx.guildId || null,
      extra: ctx.extra || null,
      resolved: false,
      resolvedAt: null,
      patch: null,
    };

    this.errors.push(entry);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift(); // drop oldest
    }

    logger.error(`[ErrorCollector] Captured ${id}: ${entry.message}`);
    return id;
  }

  /** Mark an error as resolved with patch info. */
  markResolved(id, patchInfo = {}) {
    const entry = this.errors.find(e => e.id === id);
    if (entry) {
      entry.resolved = true;
      entry.resolvedAt = new Date().toISOString();
      entry.patch = patchInfo;
    }
  }

  /** Get the N most recent errors (default 10). */
  getRecent(n = 10) {
    return this.errors.slice(-n).reverse();
  }

  /** Get a specific error by ID. */
  getById(id) {
    return this.errors.find(e => e.id === id) || null;
  }

  /** Get all unresolved errors. */
  getUnresolved() {
    return this.errors.filter(e => !e.resolved).reverse();
  }

  /** Summary stats for /sysreview. */
  getStats() {
    const total     = this.errors.length;
    const resolved  = this.errors.filter(e => e.resolved).length;
    const unresolved = total - resolved;
    const byType    = {};
    for (const e of this.errors) {
      byType[e.type] = (byType[e.type] || 0) + 1;
    }
    return { total, resolved, unresolved, byType };
  }
}

// Singleton
const errorCollector = new ErrorCollector();
module.exports = { errorCollector, ErrorCollector };
