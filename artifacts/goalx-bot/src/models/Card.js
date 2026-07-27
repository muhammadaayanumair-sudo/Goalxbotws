'use strict';

const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema(
  {
    // Ownership
    ownerId: { type: String, required: true, index: true },
    guildId: { type: String, default: null, index: true },

    // Card identity
    cardId: { type: String, required: true, unique: true, index: true },
    playerId: { type: String, required: true },
    playerName: { type: String, required: true },
    playerImage: { type: String, default: null },
    teamName: { type: String, required: true },
    teamLogo: { type: String, default: null },
    nationality: { type: String, default: null },
    position: { type: String, default: null },
    age: { type: Number, default: null },

    // Card attributes
    rarity: {
      type: String,
      enum: ['common', 'rare', 'epic', 'legendary', 'limited', 'seasonal'],
      default: 'common',
    },
    season: { type: String, default: '2024-25' },
    edition: { type: String, default: 'standard' }, // standard, world_cup, ucl, limited

    // Stats on the card
    stats: {
      pace: { type: Number, default: 50, min: 1, max: 99 },
      shooting: { type: Number, default: 50, min: 1, max: 99 },
      passing: { type: Number, default: 50, min: 1, max: 99 },
      dribbling: { type: Number, default: 50, min: 1, max: 99 },
      defending: { type: Number, default: 50, min: 1, max: 99 },
      physical: { type: Number, default: 50, min: 1, max: 99 },
      overall: { type: Number, default: 50, min: 1, max: 99 },
    },

    // Market state
    forSale: { type: Boolean, default: false },
    salePrice: { type: Number, default: null },
    forTrade: { type: Boolean, default: false },
    inAuction: { type: Boolean, default: false },
    auctionId: { type: String, default: null },

    // History
    obtainedFrom: { type: String, default: 'pack' }, // pack, trade, market, reward
    obtainedAt: { type: Date, default: Date.now },
    timesTraded: { type: Number, default: 0 },
    previousOwners: [{ type: String }],

    // Favorited by owner
    favorite: { type: Boolean, default: false },
    locked: { type: Boolean, default: false }, // prevents selling/trading
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: card overall grade letter
cardSchema.virtual('grade').get(function () {
  const overall = this.stats.overall;
  if (overall >= 90) return 'S';
  if (overall >= 80) return 'A';
  if (overall >= 70) return 'B';
  if (overall >= 60) return 'C';
  return 'D';
});

// Rarity emoji helper
cardSchema.virtual('rarityEmoji').get(function () {
  const map = {
    common: '⚪',
    rare: '🔵',
    epic: '🟣',
    legendary: '🟡',
    limited: '🔴',
    seasonal: '🟠',
  };
  return map[this.rarity] || '⚪';
});

const Card = mongoose.model('Card', cardSchema);
module.exports = Card;
