'use strict';

const mongoose = require('mongoose');
const config = require('../config/config');

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true },
    discriminator: { type: String, default: '0' },
    avatar: { type: String, default: null },

    // Economy
    coins: { type: Number, default: config.economy.startingCoins, min: 0 },
    bank: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },

    // XP & Levels
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    totalXp: { type: Number, default: 0 },

    // Cooldowns
    lastDaily: { type: Date, default: null },
    lastWeekly: { type: Date, default: null },
    lastWork: { type: Date, default: null },

    // Favorites
    favoriteTeams: [{ type: String }],
    favoriteLeagues: [{ type: String }],
    favoritePlayers: [{ type: String }],

    // Stats
    betsPlaced: { type: Number, default: 0 },
    betsWon: { type: Number, default: 0 },
    betCoinsWon: { type: Number, default: 0 },
    betCoinsLost: { type: Number, default: 0 },
    packsOpened: { type: Number, default: 0 },
    cardsOwned: { type: Number, default: 0 },
    tradesCompleted: { type: Number, default: 0 },

    // Achievements
    achievements: [
      {
        id: String,
        name: String,
        earnedAt: { type: Date, default: Date.now },
      },
    ],

    // Inventory
    inventory: [
      {
        itemId: String,
        name: String,
        quantity: { type: Number, default: 1 },
        acquiredAt: { type: Date, default: Date.now },
      },
    ],

    // Premium
    premium: { type: Boolean, default: false },
    premiumSince: { type: Date, default: null },
    premiumUntil: { type: Date, default: null },

    // Partner
    isPartner: { type: Boolean, default: false, index: true },
    partnerSince: { type: Date, default: null },
    lastPayday: { type: Date, default: null },

    // Settings
    timezone: { type: String, default: 'UTC' },
    notifications: { type: Boolean, default: true },
    language: { type: String, default: 'en' },

    // Moderation
    banned: { type: Boolean, default: false },
    banReason: { type: String, default: null },
    warnings: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: XP needed for next level
userSchema.virtual('xpToNextLevel').get(function () {
  return Math.floor(100 * Math.pow(1.5, this.level - 1));
});

// Virtual: Bet win rate
userSchema.virtual('betWinRate').get(function () {
  if (this.betsPlaced === 0) return 0;
  return ((this.betsWon / this.betsPlaced) * 100).toFixed(1);
});

/**
 * Awards XP and levels up if threshold is reached.
 * Returns { leveledUp, newLevel } object.
 */
userSchema.methods.addXp = function (amount) {
  this.xp += amount;
  this.totalXp += amount;
  const xpNeeded = Math.floor(100 * Math.pow(1.5, this.level - 1));
  let leveledUp = false;

  while (this.xp >= xpNeeded) {
    this.xp -= xpNeeded;
    this.level += 1;
    leveledUp = true;
  }

  return { leveledUp, newLevel: this.level };
};

/**
 * Safely deducts coins, returns false if insufficient.
 */
userSchema.methods.deductCoins = function (amount) {
  if (this.coins < amount) return false;
  this.coins -= amount;
  this.totalSpent += amount;
  return true;
};

/**
 * Adds coins and tracks total earned.
 */
userSchema.methods.addCoins = function (amount) {
  this.coins += amount;
  this.totalEarned += amount;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
