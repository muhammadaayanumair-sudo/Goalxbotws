'use strict';

/**
 * teamNameUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Team name sanitization, alias resolution, and search normalization.
 *
 * Solves:
 *  • "1. FC Köln" type queries where ordinal prefixes confuse API searches
 *  • Common short-hand aliases ("Man City", "PSG", "Barca", etc.)
 *  • Diacritic normalization so "Koln" finds "Köln"
 */

// ── Alias map ─────────────────────────────────────────────────────────────────
// Key  : lowercase user input (trimmed)
// Value: canonical search name that APIs understand best
const TEAM_ALIASES = {
  // ─ English short-hands ─
  'man city':        'Manchester City',
  'man united':      'Manchester United',
  'man utd':         'Manchester United',
  'united':          'Manchester United',
  'spurs':           'Tottenham Hotspur',
  'tottenham':       'Tottenham Hotspur',
  'wolves':          'Wolverhampton Wanderers',
  'newcastle':       'Newcastle United',
  'leicester':       'Leicester City',
  'brighton':        'Brighton & Hove Albion',
  'west ham':        'West Ham United',
  'norwich':         'Norwich City',
  'villa':           'Aston Villa',

  // ─ Spanish ─
  'barca':           'Barcelona',
  'barca fc':        'Barcelona',
  'fcb':             'Barcelona',
  'atletico':        'Atletico Madrid',
  'atletico madrid': 'Atletico Madrid',
  'real':            'Real Madrid',
  'sevilla fc':      'Sevilla',

  // ─ French ─
  'psg':             'Paris Saint-Germain',
  'paris':           'Paris Saint-Germain',
  'paris sg':        'Paris Saint-Germain',

  // ─ Italian ─
  'juve':            'Juventus',
  'juventus fc':     'Juventus',
  'inter':           'Inter Milan',
  'inter milan':     'Internazionale',
  'internazionale':  'Internazionale',
  'ac milan':        'Milan',
  'roma':            'AS Roma',

  // ─ German ordinal-prefix teams ─
  '1. fc köln':          'Köln',
  '1. fc koln':          'Köln',
  'fc köln':             'Köln',
  'koln':                'Köln',
  '1. fc kaiserslautern':'Kaiserslautern',
  '1. fc heidenheim':    'Heidenheim',
  '1. fc nürnberg':      'Nürnberg',
  '1. fc union berlin':  'Union Berlin',
  'union berlin':        'Union Berlin',
  '1. fc magdeburg':     'Magdeburg',
  '1. fsv mainz 05':     'Mainz 05',
  'mainz':               'Mainz 05',
  'fc schalke 04':       'Schalke 04',
  'schalke':             'Schalke 04',
  'rb leipzig':          'RB Leipzig',
  'red bull leipzig':    'RB Leipzig',
  'borussia':            'Borussia Dortmund',
  'bvb':                 'Borussia Dortmund',
  'dortmund':            'Borussia Dortmund',

  // ─ Dutch ─
  'ajax':            'Ajax',
  'ajax amsterdam':  'Ajax',
  'psv':             'PSV Eindhoven',

  // ─ Portuguese ─
  'sporting':        'Sporting CP',
  'sporting lisbon': 'Sporting CP',
  'benfica':         'SL Benfica',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Strip leading ordinal prefixes like "1.", "2.", "3." from team names.
 * "1. FC Köln" → "FC Köln"
 */
function stripOrdinalPrefix(name) {
  return name.replace(/^\d+\.\s+/, '').trim();
}

/**
 * Fold common diacritics to ASCII equivalents so "Koln" → "Köln" searches
 * work via the alias map even without special characters.
 */
function foldDiacritics(name) {
  return name
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/ß/g, 'ss').replace(/é|è|ê/g, 'e').replace(/à|â/g, 'a')
    .replace(/ñ/g, 'n').replace(/ç/g, 'c');
}

/**
 * Sanitize a raw team name for display — removes ordinal prefixes so
 * "1. FC Köln" becomes "FC Köln" in embeds.
 */
function sanitizeTeamName(name) {
  if (!name || typeof name !== 'string') return name;
  return stripOrdinalPrefix(name.trim());
}

/**
 * Resolve a user-supplied team name to the best search term:
 *  1. Check exact alias (lowercase)
 *  2. Check alias after folding diacritics
 *  3. Strip ordinal prefix
 *  4. Return original (trimmed)
 *
 * This is the function to use before passing a name to API search endpoints.
 */
function normalizeForSearch(name) {
  if (!name || typeof name !== 'string') return name;
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // Direct alias hit
  if (TEAM_ALIASES[lower]) return TEAM_ALIASES[lower];

  // Alias hit after folding diacritics in the input
  const folded = foldDiacritics(lower);
  if (TEAM_ALIASES[folded]) return TEAM_ALIASES[folded];

  // Strip ordinal prefix (e.g. "1. FC Köln" → "FC Köln")
  const stripped = stripOrdinalPrefix(trimmed);
  if (stripped !== trimmed) return stripped;

  return trimmed;
}

/**
 * Produce a user-safe error message — strips internal API noise such as
 * raw axios errors, "Primary API failed", status codes, etc.
 *
 * @param {Error|string} err
 * @param {string} fallback  Message to show when the real error is too internal
 */
function safeErrorMessage(err, fallback = 'Something went wrong. Please try again later.') {
  const msg = (typeof err === 'string' ? err : err?.message) || '';
  const isInternal = /API-Football error|no fallback available|all football api providers|ECONNREFUSED|ETIMEDOUT|socket hang up|AbortError|statusCode|rate.limit/i.test(msg);
  return isInternal ? fallback : (msg || fallback);
}

module.exports = { sanitizeTeamName, normalizeForSearch, safeErrorMessage, TEAM_ALIASES };
