'use strict';

const RARITIES = {
  COMMON: {
    id: 'common',
    name: 'Common',
    emoji: '⚪',
    color: '#95A5A6',
    multiplier: 1,
    baseValue: 100,
  },
  RARE: {
    id: 'rare',
    name: 'Rare',
    emoji: '🔵',
    color: '#3498DB',
    multiplier: 3,
    baseValue: 350,
  },
  EPIC: {
    id: 'epic',
    name: 'Epic',
    emoji: '🟣',
    color: '#9B59B6',
    multiplier: 8,
    baseValue: 1000,
  },
  LEGENDARY: {
    id: 'legendary',
    name: 'Legendary',
    emoji: '🟡',
    color: '#F1C40F',
    multiplier: 20,
    baseValue: 5000,
  },
  LIMITED: {
    id: 'limited',
    name: 'Limited Edition',
    emoji: '🔴',
    color: '#E74C3C',
    multiplier: 50,
    baseValue: 15000,
  },
  SEASONAL: {
    id: 'seasonal',
    name: 'Seasonal',
    emoji: '🟠',
    color: '#E67E22',
    multiplier: 35,
    baseValue: 8000,
  },
};

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'limited', 'seasonal'];

/**
 * Looks up rarity metadata by its lowercase id (e.g. 'legendary'), since
 * card documents store rarity as lowercase but RARITIES keys are uppercase.
 */
function getRarity(id) {
  return RARITIES[id?.toUpperCase()] || RARITIES.COMMON;
}

/** Shorthand for just the color hex of a rarity id. */
function rarityColor(id) {
  return getRarity(id).color;
}

/** Shorthand for just the emoji of a rarity id. */
function rarityEmoji(id) {
  return getRarity(id).emoji;
}

/**
 * Given an array of items each with a `.rarity` string property, returns
 * the id of the highest rarity present (or 'common' if the array is empty).
 * Used to pick an embed's accent color from a set of cards.
 */
function highestRarity(items) {
  const order = [...RARITY_ORDER].reverse(); // legendary/limited/seasonal first
  if (!items?.length) return 'common';
  return order.find((r) => items.some((i) => i.rarity === r)) || 'common';
}

module.exports = { RARITIES, RARITY_ORDER, getRarity, rarityColor, rarityEmoji, highestRarity };
