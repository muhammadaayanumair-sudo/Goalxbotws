'use strict';

const mongoose = require('mongoose');
const config = require('../config/config');
const { logger } = require('../utils/logger');

/**
 * Connects to MongoDB using Mongoose.
 * Retries up to 5 times on failure with exponential backoff.
 */
async function connectDatabase(retries = 5, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(config.database.uri, config.database.options);
      logger.info(`[Database] Connected to MongoDB: ${mongoose.connection.host}`);

      mongoose.connection.on('error', (err) => {
        logger.error('[Database] MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('[Database] MongoDB disconnected. Attempting reconnect...');
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('[Database] MongoDB reconnected successfully');
      });

      return;
    } catch (error) {
      logger.error(`[Database] Connection attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt < retries) {
        const wait = delay * attempt;
        logger.info(`[Database] Retrying in ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        throw new Error(`[Database] Could not connect to MongoDB after ${retries} attempts`);
      }
    }
  }
}

/**
 * Gracefully disconnects from MongoDB.
 */
async function disconnectDatabase() {
  await mongoose.disconnect();
  logger.info('[Database] Disconnected from MongoDB');
}

module.exports = { connectDatabase, disconnectDatabase };
