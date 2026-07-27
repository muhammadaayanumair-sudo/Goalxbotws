'use strict';

/**
 * Popular football league constants used across GoalX.
 * IDs correspond to API-Football league IDs.
 */
const LEAGUES = {
  // Top 5 European Leagues
  PREMIER_LEAGUE: { id: 39, name: 'Premier League', country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', fdCode: 'PL' },
  LA_LIGA: { id: 140, name: 'La Liga', country: 'Spain', flag: '🇪🇸', fdCode: 'PD' },
  BUNDESLIGA: { id: 78, name: 'Bundesliga', country: 'Germany', flag: '🇩🇪', fdCode: 'BL1' },
  SERIE_A: { id: 135, name: 'Serie A', country: 'Italy', flag: '🇮🇹', fdCode: 'SA' },
  LIGUE_1: { id: 61, name: 'Ligue 1', country: 'France', flag: '🇫🇷', fdCode: 'FL1' },

  // European Competitions
  CHAMPIONS_LEAGUE: { id: 2, name: 'UEFA Champions League', country: 'Europe', flag: '🏆', fdCode: 'CL' },
  EUROPA_LEAGUE: { id: 3, name: 'UEFA Europa League', country: 'Europe', flag: '🟠', fdCode: 'EL' },
  CONFERENCE_LEAGUE: { id: 848, name: 'UEFA Conference League', country: 'Europe', flag: '🔵', fdCode: 'UECL' },

  // International
  WORLD_CUP: { id: 1, name: 'FIFA World Cup', country: 'World', flag: '🌍', fdCode: 'WC' },
  EUROS: { id: 4, name: 'UEFA Euro', country: 'Europe', flag: '🇪🇺', fdCode: 'EC' },

  // Other Major Leagues
  MLS: { id: 253, name: 'Major League Soccer', country: 'USA', flag: '🇺🇸', fdCode: null },
  EREDIVISIE: { id: 88, name: 'Eredivisie', country: 'Netherlands', flag: '🇳🇱', fdCode: 'DED' },
  PRIMEIRA_LIGA: { id: 94, name: 'Primeira Liga', country: 'Portugal', flag: '🇵🇹', fdCode: 'PPL' },
  SUPER_LIG: { id: 203, name: 'Süper Lig', country: 'Turkey', flag: '🇹🇷', fdCode: null },
  SCOTTISH_PREM: { id: 179, name: 'Scottish Premiership', country: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', fdCode: null },
};

/**
 * Core leagues covered by automatic scheduler messages.
 * Only these competitions trigger fixture digests, live updates, and match-day posts.
 */
const DEFAULT_LEAGUES = [
  LEAGUES.PREMIER_LEAGUE,
  LEAGUES.LA_LIGA,
  LEAGUES.BUNDESLIGA,
  LEAGUES.SERIE_A,
  LEAGUES.LIGUE_1,
  LEAGUES.WORLD_CUP,
];

/**
 * Current active season year.
 */
const CURRENT_SEASON = 2024;

module.exports = { LEAGUES, DEFAULT_LEAGUES, CURRENT_SEASON };
