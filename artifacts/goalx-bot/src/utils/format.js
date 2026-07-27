'use strict';

/**
 * Format milliseconds into a human-readable time string.
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Format a coin amount with comma separators and ⚽ emoji.
 */
function formatCoins(amount) {
  return `**${amount.toLocaleString()}** ⚽`;
}

/**
 * Format a number with commas.
 */
function formatNumber(n) {
  return n?.toLocaleString() ?? '0';
}

/**
 * Truncate a string to a max length with ellipsis.
 */
function truncate(str, max = 100) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

/**
 * Format a date as a relative Discord timestamp.
 */
function relativeTimestamp(date) {
  const unix = Math.floor(new Date(date).getTime() / 1000);
  return `<t:${unix}:R>`;
}

/**
 * Format a date as a full Discord timestamp.
 */
function fullTimestamp(date) {
  const unix = Math.floor(new Date(date).getTime() / 1000);
  return `<t:${unix}:F>`;
}

module.exports = { formatDuration, formatCoins, formatNumber, truncate, relativeTimestamp, fullTimestamp };
