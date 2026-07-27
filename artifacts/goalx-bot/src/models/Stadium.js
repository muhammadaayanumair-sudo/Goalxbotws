'use strict';

const mongoose = require('mongoose');

/** Stadium level progression table. Index = level - 1. */
const LEVELS = [
  { level: 1,  name: 'Local Ground',        capacity:   1_000, revenuePerHour:    30, upgradeCost:    2_000 },
  { level: 2,  name: 'District Stadium',    capacity:   5_000, revenuePerHour:    80, upgradeCost:    5_000 },
  { level: 3,  name: 'Regional Arena',      capacity:  15_000, revenuePerHour:   180, upgradeCost:   12_000 },
  { level: 4,  name: 'City Stadium',        capacity:  30_000, revenuePerHour:   350, upgradeCost:   25_000 },
  { level: 5,  name: 'Premier Venue',       capacity:  50_000, revenuePerHour:   600, upgradeCost:   50_000 },
  { level: 6,  name: 'Grand Stadium',       capacity:  70_000, revenuePerHour:   950, upgradeCost:   90_000 },
  { level: 7,  name: 'Elite Arena',         capacity:  85_000, revenuePerHour: 1_400, upgradeCost:  150_000 },
  { level: 8,  name: 'Iconic Ground',       capacity:  95_000, revenuePerHour: 2_000, upgradeCost:  250_000 },
  { level: 9,  name: 'World-Class Venue',   capacity: 110_000, revenuePerHour: 2_800, upgradeCost:  400_000 },
  { level: 10, name: 'Legendary Stadium',   capacity: 120_000, revenuePerHour: 4_000, upgradeCost:       null },
];

const stadiumSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    name:   { type: String, default: 'My Stadium', maxlength: 40 },
    level:  { type: Number, default: 1, min: 1, max: 10 },

    // Base passive revenue
    lastCollected:  { type: Date, default: Date.now },
    totalCollected: { type: Number, default: 0 },

    // Investment system
    investmentAmount: { type: Number, default: 0 },
    investmentDate:   { type: Date, default: null },
  },
  { timestamps: true }
);

/** Coins earned since last collection (capped at 24 hours). */
stadiumSchema.methods.pendingRevenue = function () {
  const hoursSince = (Date.now() - new Date(this.lastCollected).getTime()) / 3_600_000;
  const rate = LEVELS[this.level - 1].revenuePerHour;
  return Math.floor(Math.min(hoursSince, 24) * rate);
};

/** Whether the active investment has matured (≥24h). */
stadiumSchema.methods.investmentMature = function () {
  if (!this.investmentAmount || !this.investmentDate) return false;
  const hoursSince = (Date.now() - new Date(this.investmentDate).getTime()) / 3_600_000;
  return hoursSince >= 24;
};

/** Return rate for investments: 10% base + 1% per stadium level above 1. */
stadiumSchema.methods.investReturnRate = function () {
  return 0.10 + (this.level - 1) * 0.01;
};

const Stadium = mongoose.model('Stadium', stadiumSchema);
module.exports = { Stadium, LEVELS };
