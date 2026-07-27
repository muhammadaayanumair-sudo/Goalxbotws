'use strict';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const configuredLevel = process.env.LOG_LEVEL || 'info';
const minLevel = LOG_LEVELS[configuredLevel] ?? 1;

function timestamp() {
  return new Date().toISOString();
}

function log(level, ...args) {
  if (LOG_LEVELS[level] < minLevel) return;
  const prefix = `[${timestamp()}] [${level.toUpperCase()}]`;
  if (level === 'error') {
    console.error(prefix, ...args);
  } else if (level === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};

module.exports = { logger };
