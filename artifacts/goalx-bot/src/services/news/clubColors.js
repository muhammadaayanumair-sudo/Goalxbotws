'use strict';

/**
 * Club color emoji mapping for Fabrizio-style news headlines.
 * Used to append thematic color pills to transfer/done-deal broadcasts.
 */
const CLUB_COLORS = {
  // Spain
  'barcelona': '🔵🔴',
  'real madrid': '⚪',
  'atletico madrid': '🔴⚪',
  'atletico': '🔴⚪',
  'sevilla': '⚪🔴',
  'valencia': '⚫🦇',
  'real betis': '🟢⚪',
  'athletic bilbao': '🔴⚪',
  'real sociedad': '🔵⚪',
  'villarreal': '🟡',

  // England
  'manchester united': '🔴',
  'man united': '🔴',
  'man utd': '🔴',
  'manchester city': '🔵',
  'man city': '🔵',
  'liverpool': '🔴',
  'chelsea': '🔵',
  'arsenal': '🔴⚪',
  'tottenham': '⚪',
  'spurs': '⚪',
  'newcastle': '⚫⚪',
  'aston villa': '🟣🔵',
  'west ham': '⚪🔴',
  'everton': '🔵',
  'leicester': '🔵',
  'leeds': '⚪🟡',
  'brighton': '🔵⚪',

  // Italy
  'juventus': '⚪⚫',
  'ac milan': '🔴⚫',
  'milan': '🔴⚫',
  'inter': '🔵⚫',
  'inter milan': '🔵⚫',
  'napoli': '🔵',
  'roma': '🔴🟡',
  'lazio': '🔵⚪',
  'atalanta': '🔵⚫',
  'fiorentina': '🟣',

  // Germany
  'bayern munich': '🔴',
  'bayern munchen': '🔴',
  'bayern': '🔴',
  'borussia dortmund': '🟡⚫',
  'dortmund': '🟡⚫',
  'bayer leverkusen': '🔴⚫',
  'leverkusen': '🔴⚫',
  'rb leipzig': '⚪🔴',
  'leipzig': '⚪🔴',
  'eintracht frankfurt': '🔴⚫',
  'frankfurt': '🔴⚫',

  // France
  'paris saint-germain': '🔵🔴',
  'psg': '🔵🔴',
  'marseille': '🔵⚪',
  'olympique lyonnais': '🔴🔵',
  'lyon': '🔴🔵',
  'monaco': '🔴⚪',
  'lille': '🔴',

  // Portugal
  'benfica': '🔴⚪',
  'porto': '🔵⚪',
  'sporting cp': '🟢⚪',
  'sporting lisbon': '🟢⚪',

  // Netherlands
  'ajax': '🔴⚪',
  'psv': '🔴⚪',
  'feyenoord': '🔴⚪',

  // Brazil
  'flamengo': '🔴⚫',
  'palmeiras': '🟢',
  'sao paulo': '🔴⚪⚫',
  'santos': '⚪⚫',

  // Argentina
  'boca juniors': '🔵🟡',
  'boca': '🔵🟡',
  'river plate': '🔴⚪',
  'river': '🔴⚪',
};

const AMBIGUOUS_NAMES = new Set(['ajax', 'roma', 'lille', 'lyon', 'porto', 'frankfurt', 'leipzig']);

/**
 * Find the best matching color-pill emoji string for a headline.
 * @param {string} text
 * @returns {string} Emoji string or empty string.
 */
function detectClubColors(text) {
  const lower = text.toLowerCase();
  let bestMatch = '';
  let bestLength = 0;

  for (const [club, emojis] of Object.entries(CLUB_COLORS)) {
    if (lower.includes(club)) {
      // Avoid ambiguous short names matching inside other words unless exact.
      if (AMBIGUOUS_NAMES.has(club)) {
        const regex = new RegExp(`\\b${club.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (!regex.test(lower)) continue;
      }
      if (club.length > bestLength) {
        bestLength = club.length;
        bestMatch = emojis;
      }
    }
  }

  return bestMatch;
}

module.exports = { CLUB_COLORS, detectClubColors };
