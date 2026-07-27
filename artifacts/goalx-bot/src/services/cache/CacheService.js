'use strict';

const NodeCache = require('node-cache');
const { logger } = require('../../utils/logger');

/**
 * CacheService — pure in-memory cache using node-cache.
 * No Redis required. Runs perfectly on Railway without any plugins.
 */
class CacheService {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
    this.useRedis = false; // kept for interface compatibility
    logger.info('[Cache] Using in-memory cache (node-cache)');
  }

  /**
   * Required by GoalXClient — no-op for in-memory cache.
   */
  async connect() {
    // Nothing to connect — in-memory is always ready
  }

  /**
   * Gets a cached value. Returns null if not found or expired.
   */
  async get(key) {
    try {
      const val = this.cache.get(key);
      return val !== undefined ? val : null;
    } catch {
      return null;
    }
  }

  /**
   * Stores a value with an optional TTL in seconds (default 300).
   */
  async set(key, value, ttl = 300) {
    try {
      this.cache.set(key, value, ttl);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deletes a cache key.
   */
  async del(key) {
    try {
      this.cache.del(key);
    } catch { /* ignore */ }
  }

  /**
   * Checks whether a key exists and hasn't expired.
   */
  async exists(key) {
    return this.cache.has(key);
  }

  /**
   * Returns cached value if present, otherwise calls fetchFn,
   * caches the result, and returns it.
   */
  async getOrSet(key, fetchFn, ttl = 300) {
    const cached = await this.get(key);
    if (cached !== null) return cached;

    const fresh = await fetchFn();
    if (fresh !== null && fresh !== undefined) {
      // Don't cache empty arrays — they often mean "no data yet" for live queries
      if (Array.isArray(fresh) && fresh.length === 0) {
        return fresh;
      }
      await this.set(key, fresh, ttl);
    }
    return fresh;
  }

  /**
   * Flushes all keys matching a prefix pattern.
   * (In-memory: iterates all keys and deletes matching ones.)
   */
  async flushPattern(pattern) {
    try {
      const prefix = pattern.replace('*', '');
      const keys = this.cache.keys().filter((k) => k.startsWith(prefix));
      if (keys.length > 0) this.cache.del(keys);
    } catch { /* ignore */ }
  }

  /**
   * Returns cache stats for monitoring.
   */
  async stats() {
    return { type: 'memory', stats: this.cache.getStats() };
  }
}

module.exports = { CacheService };