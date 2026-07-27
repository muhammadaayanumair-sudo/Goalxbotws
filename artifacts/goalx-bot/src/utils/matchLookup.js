'use strict';

/**
 * Parse "Arsenal vs Chelsea", "Arsenal v Chelsea", "Arsenal - Chelsea" → ['Arsenal', 'Chelsea']
 */
function parseMatchQuery(query) {
  const normalized = query.trim();
  const vsMatch = normalized.match(/^(.+?)\s+(?:vs?\.?|versus)\s+(.+)$/i);
  if (vsMatch) return [vsMatch[1].trim(), vsMatch[2].trim()];
  const dashMatch = normalized.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch) return [dashMatch[1].trim(), dashMatch[2].trim()];
  throw new Error(
    `Couldn't parse **"${query}"** — use the format **Team A vs Team B** (e.g. \`Arsenal vs Chelsea\`).`
  );
}

/**
 * Case-insensitive fuzzy match — true if either string contains the other.
 */
function nameMatch(candidate, query) {
  const c = candidate.toLowerCase().trim();
  const q = query.toLowerCase().trim();
  return c.includes(q) || q.includes(c);
}

/**
 * Resolve a fixture by match name (e.g. "Arsenal vs Chelsea").
 * Searches ±7 days of fixtures for the team pair, returning the
 * closest match to now (upcoming first, then recent).
 *
 * @param {import('../services/FootballApiManager').FootballApiManager} api
 * @param {string} query  e.g. "Norway vs England"
 * @returns {Promise<object>}  Fixture in api-football shape
 */
async function resolveMatchByName(api, query) {
  const [team1, team2] = parseMatchQuery(query);

  let teams;
  try {
    teams = await api.searchTeam(team1);
  } catch (err) {
    throw new Error(`Could not search for **"${team1}"**: ${err.message}`);
  }

  if (!teams?.length) {
    throw new Error(
      `No team found matching **"${team1}"**. Check the spelling and try again.`
    );
  }

  const now = Date.now();
  const windowMs = 7 * 24 * 60 * 60 * 1000; // ±7 days

  // Try the top 3 results in case the name is ambiguous (e.g. "United")
  for (const teamResult of teams.slice(0, 3)) {
    const teamId = teamResult.team?.id;
    if (!teamId) continue;

    let fixtures;
    try {
      fixtures = await api.getFixturesByTeam(teamId, 20);
    } catch {
      continue;
    }
    if (!fixtures?.length) continue;

    const inWindow = fixtures
      .filter((f) => Math.abs(new Date(f.fixture?.date).getTime() - now) <= windowMs)
      .sort((a, b) => {
        const da = Math.abs(new Date(a.fixture?.date).getTime() - now);
        const db = Math.abs(new Date(b.fixture?.date).getTime() - now);
        return da - db;
      });

    for (const f of inWindow) {
      const homeName = f.teams?.home?.name || '';
      const awayName = f.teams?.away?.name || '';
      if (nameMatch(homeName, team2) || nameMatch(awayName, team2)) {
        return f;
      }
    }
  }

  throw new Error(
    `No match found for **"${query}"** in the next/last 7 days.\n` +
    `Tip: use \`/fixtures\` to see upcoming matches, then copy the exact team names.`
  );
}

module.exports = { resolveMatchByName };
