'use strict';

const { logger } = require('../../utils/logger');

/**
 * CircuitBreaker — per-provider health tracking with automatic trip/reset.
 *
 * States:
 *   CLOSED  → provider is healthy, requests flow through
 *   OPEN    → provider tripped, requests bypassed until cooldown expires
 *   HALF    → cooldown expired, one probe request is allowed through
 *
 * Configuration (per provider):
 *   failureThreshold — consecutive failures before tripping (default: 3)
 *   resetTimeout     — ms before attempting recovery (default: 60_000)
 */
class CircuitBreaker {
  constructor({ failureThreshold = 3, resetTimeout = 60_000 } = {}) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    // providerName → { state, failures, lastFailureAt, tripCount }
    this._providers = new Map();
  }

  _get(name) {
    if (!this._providers.has(name)) {
      this._providers.set(name, {
        state: 'CLOSED',
        failures: 0,
        lastFailureAt: null,
        tripCount: 0,
        lastSuccessAt: null,
      });
    }
    return this._providers.get(name);
  }

  /** Returns true if the provider is currently available to accept requests. */
  isAvailable(name) {
    const p = this._get(name);
    if (p.state === 'CLOSED') return true;
    if (p.state === 'OPEN') {
      const elapsed = Date.now() - p.lastFailureAt;
      if (elapsed >= this.resetTimeout) {
        p.state = 'HALF';
        logger.info(`[CircuitBreaker] ${name}: OPEN → HALF (probe allowed)`);
        return true;
      }
      return false;
    }
    // HALF — allow one probe
    return true;
  }

  /** Record a successful call — resets the circuit. */
  recordSuccess(name) {
    const p = this._get(name);
    if (p.state !== 'CLOSED') {
      logger.info(`[CircuitBreaker] ${name}: ${p.state} → CLOSED (recovered)`);
    }
    p.state = 'CLOSED';
    p.failures = 0;
    p.lastSuccessAt = Date.now();
  }

  /** Record a failed call — may trip the circuit. */
  recordFailure(name) {
    const p = this._get(name);
    p.failures++;
    p.lastFailureAt = Date.now();
    if (p.state === 'HALF' || p.failures >= this.failureThreshold) {
      if (p.state !== 'OPEN') {
        p.tripCount++;
        logger.warn(
          `[CircuitBreaker] ${name}: tripped OPEN (trip #${p.tripCount}, ` +
          `${p.failures} failures). Cooldown: ${this.resetTimeout / 1000}s`
        );
      }
      p.state = 'OPEN';
    }
  }

  /** Snapshot of all provider circuit states (for /sysreview). */
  getAllStatus() {
    const result = {};
    for (const [name, p] of this._providers.entries()) {
      const msUntilReset = p.state === 'OPEN' && p.lastFailureAt
        ? Math.max(0, this.resetTimeout - (Date.now() - p.lastFailureAt))
        : null;
      result[name] = {
        state: p.state,
        failures: p.failures,
        tripCount: p.tripCount,
        lastFailureAt: p.lastFailureAt ? new Date(p.lastFailureAt).toISOString() : null,
        lastSuccessAt: p.lastSuccessAt ? new Date(p.lastSuccessAt).toISOString() : null,
        msUntilReset,
      };
    }
    return result;
  }

  /** Manually reset a provider (owner command). */
  reset(name) {
    const p = this._get(name);
    p.state = 'CLOSED';
    p.failures = 0;
    logger.info(`[CircuitBreaker] ${name}: manually reset to CLOSED`);
  }
}

module.exports = { CircuitBreaker };
