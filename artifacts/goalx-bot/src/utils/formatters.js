'use strict';

const moment = require('moment-timezone');

/**
 * Formats a UTC ISO date string to a human-readable local time.
 */
function formatMatchTime(isoDate, timezone = 'UTC') {
  return moment(isoDate).tz(timezone).format('ddd DD MMM YYYY • HH:mm z');
}

/**
 * Returns time until a match starts, e.g. "in 2h 30m".
 */
function timeUntilMatch(isoDate) {
  const diff = moment(isoDate).diff(moment());
  if (diff <= 0) return 'Kickoff imminent';
  const duration = moment.duration(diff);
  const h = Math.floor(duration.asHours());
  const m = duration.minutes();
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

/**
 * Formats a large number with comma separators.
 */
function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return Number(num).toLocaleString('en-US');
}

/**
 * Formats coin amounts with the coin emoji.
 */
function formatCoins(amount) {
  return `🪙 ${formatNumber(amount)}`;
}

/**
 * Truncates a string to a max length with ellipsis.
 */
function truncate(str, maxLength = 100) {
  if (!str) return '';
  return str.length > maxLength ? `${str.slice(0, maxLength - 3)}...` : str;
}

/**
 * Converts match status codes to readable labels.
 */
function formatMatchStatus(status) {
  const statuses = {
    'TBD': '🔵 To Be Defined',
    'NS': '🕐 Not Started',
    '1H': '🟢 1st Half',
    'HT': '🟡 Half Time',
    '2H': '🟢 2nd Half',
    'ET': '🟠 Extra Time',
    'BT': '🟠 Break Time',
    'P': '🔴 Penalty',
    'SUSP': '⏸️ Suspended',
    'INT': '⏸️ Interrupted',
    'FT': '⚫ Full Time',
    'AET': '⚫ After Extra Time',
    'PEN': '⚫ After Penalties',
    'PST': '📅 Postponed',
    'CANC': '❌ Cancelled',
    'ABD': '❌ Abandoned',
    'AWD': '🏆 Awarded',
    'WO': '🏆 Walkover',
    'LIVE': '🔴 Live',
    'FINISHED': '⚫ Finished',
    'SCHEDULED': '🕐 Scheduled',
    'IN_PLAY': '🟢 In Play',
    'PAUSED': '🟡 Paused',
    'POSTPONED': '📅 Postponed',
    'CANCELLED': '❌ Cancelled',
    'AWARDED': '🏆 Awarded',
  };
  return statuses[status] || `🔵 ${status}`;
}

/**
 * Returns a colored circle based on team form result.
 */
function formatFormResult(result) {
  switch (result?.toUpperCase()) {
    case 'W': return '🟢';
    case 'D': return '🟡';
    case 'L': return '🔴';
    default: return '⚫';
  }
}

/**
 * Formats a player's age from a birth date string.
 */
function formatAge(birthDate) {
  if (!birthDate) return 'N/A';
  return `${moment().diff(moment(birthDate), 'years')} years`;
}

/**
 * Formats a market value number to a short readable string.
 */
function formatMarketValue(value) {
  if (!value) return 'N/A';
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
  return `€${value}`;
}

/**
 * Creates a progress bar string for XP or stats.
 */
function progressBar(current, max, length = 10) {
  const filled = Math.round((current / max) * length);
  const empty = length - filled;
  return `${'█'.repeat(Math.max(0, filled))}${'░'.repeat(Math.max(0, empty))}`;
}

/**
 * Ordinal number formatter: 1 -> "1st", 2 -> "2nd", etc.
 */
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

module.exports = {
  formatMatchTime,
  timeUntilMatch,
  formatNumber,
  formatCoins,
  truncate,
  formatMatchStatus,
  formatFormResult,
  formatAge,
  formatMarketValue,
  progressBar,
  ordinal,
};
