'use strict';

/**
 * Master list of all GoalX achievements.
 *
 * Each entry has:
 *   id        - unique string key stored in User.achievements
 *   name      - display name
 *   emoji     - visual icon
 *   desc      - short description shown in /achievements
 *   check(u)  - function(user, extras?) → boolean  (receives lean user doc + optional extras)
 */
const ACHIEVEMENTS = [
  // ── Economy ────────────────────────────────────────────────────────────────
  {
    id: 'first_coins',
    name: 'First Pay Packet',
    emoji: '🪙',
    desc: 'Earn your first coins.',
    check: (u) => u.totalEarned >= 1,
  },
  {
    id: 'thousandaire',
    name: 'Thousandaire',
    emoji: '💵',
    desc: 'Accumulate 10,000 coins in total earnings.',
    check: (u) => u.totalEarned >= 10_000,
  },
  {
    id: 'hundred_grand',
    name: 'Hundred Grand',
    emoji: '💰',
    desc: 'Earn 100,000 coins in total.',
    check: (u) => u.totalEarned >= 100_000,
  },
  {
    id: 'millionaire',
    name: 'Millionaire',
    emoji: '🤑',
    desc: 'Earn 1,000,000 coins in total.',
    check: (u) => u.totalEarned >= 1_000_000,
  },
  {
    id: 'big_spender',
    name: 'Big Spender',
    emoji: '🛍️',
    desc: 'Spend 50,000 coins in total.',
    check: (u) => u.totalSpent >= 50_000,
  },

  // ── Leveling ───────────────────────────────────────────────────────────────
  {
    id: 'level_5',
    name: 'Rising Star',
    emoji: '⭐',
    desc: 'Reach Level 5.',
    check: (u) => u.level >= 5,
  },
  {
    id: 'level_10',
    name: 'Established Pro',
    emoji: '🌟',
    desc: 'Reach Level 10.',
    check: (u) => u.level >= 10,
  },
  {
    id: 'level_25',
    name: 'Football Legend',
    emoji: '👑',
    desc: 'Reach Level 25.',
    check: (u) => u.level >= 25,
  },

  // ── Betting ─────────────────────────────────────────────────────────────────
  {
    id: 'first_bet_win',
    name: 'Lucky Punt',
    emoji: '🎯',
    desc: 'Win your first bet.',
    check: (u) => u.betsWon >= 1,
  },
  {
    id: 'five_bet_wins',
    name: 'On a Roll',
    emoji: '🔥',
    desc: 'Win 5 bets.',
    check: (u) => u.betsWon >= 5,
  },
  {
    id: 'twentyfive_bet_wins',
    name: 'Betting Pro',
    emoji: '📈',
    desc: 'Win 25 bets.',
    check: (u) => u.betsWon >= 25,
  },
  {
    id: 'hundred_bet_wins',
    name: 'Betting Legend',
    emoji: '🏆',
    desc: 'Win 100 bets.',
    check: (u) => u.betsWon >= 100,
  },

  // ── Cards ───────────────────────────────────────────────────────────────────
  {
    id: 'first_pack',
    name: 'Pack Opener',
    emoji: '📦',
    desc: 'Open your first card pack.',
    check: (u) => u.packsOpened >= 1,
  },
  {
    id: 'ten_packs',
    name: 'Pack Addict',
    emoji: '🃏',
    desc: 'Open 10 card packs.',
    check: (u) => u.packsOpened >= 10,
  },
  {
    id: 'card_collector',
    name: 'Card Collector',
    emoji: '📚',
    desc: 'Own 25 cards.',
    check: (u) => u.cardsOwned >= 25,
  },
  {
    id: 'trader',
    name: 'Trader',
    emoji: '🤝',
    desc: 'Complete 5 card trades.',
    check: (u) => u.tradesCompleted >= 5,
  },

  // ── Stadium ─────────────────────────────────────────────────────────────────
  {
    id: 'stadium_owner',
    name: 'Stadium Owner',
    emoji: '🏟️',
    desc: 'Build your first stadium.',
    check: (u, extras) => extras?.hasStadium === true,
  },
  {
    id: 'stadium_pro',
    name: 'Premier Venue',
    emoji: '🌆',
    desc: 'Upgrade your stadium to Level 5.',
    check: (u, extras) => (extras?.stadiumLevel ?? 0) >= 5,
  },

  // ── Contracts ───────────────────────────────────────────────────────────────
  {
    id: 'contract_king',
    name: 'Contract King',
    emoji: '✍️',
    desc: 'Hold 3 active player contracts simultaneously.',
    check: (u, extras) => (extras?.activeContracts ?? 0) >= 3,
  },
];

module.exports = { ACHIEVEMENTS };
