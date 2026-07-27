'use strict';

const mongoose = require('mongoose');

/** Pre-defined signable players. Rotates daily so everyone sees a fresh pool. */
const CONTRACT_PLAYERS = [
  { name: 'Marcus Hartley',   position: 'Attacker',   overall: 82, signingFee: 2_000, dailySalary: 100, dailyRevenue: 350 },
  { name: 'João Ferreira',    position: 'Midfielder',  overall: 79, signingFee: 1_500, dailySalary:  80, dailyRevenue: 280 },
  { name: 'Stefan Kovač',     position: 'Defender',    overall: 77, signingFee: 1_000, dailySalary:  60, dailyRevenue: 200 },
  { name: 'Luis Domingo',     position: 'Attacker',   overall: 88, signingFee: 4_000, dailySalary: 200, dailyRevenue: 650 },
  { name: 'Thierry Mbele',    position: 'Midfielder',  overall: 84, signingFee: 2_500, dailySalary: 130, dailyRevenue: 420 },
  { name: "Ryan O'Brien",     position: 'Goalkeeper',  overall: 80, signingFee: 1_800, dailySalary:  90, dailyRevenue: 310 },
  { name: 'Ahmed Al-Rashid',  position: 'Defender',    overall: 75, signingFee:   800, dailySalary:  50, dailyRevenue: 170 },
  { name: 'Carlos Mendez',    position: 'Attacker',   overall: 91, signingFee: 7_000, dailySalary: 350, dailyRevenue: 1_100 },
  { name: 'Kenji Nakamura',   position: 'Midfielder',  overall: 83, signingFee: 2_200, dailySalary: 110, dailyRevenue: 380 },
  { name: 'Pierre Dubois',    position: 'Defender',    overall: 78, signingFee: 1_200, dailySalary:  70, dailyRevenue: 240 },
  { name: 'Andrei Popescu',   position: 'Midfielder',  overall: 76, signingFee:   900, dailySalary:  55, dailyRevenue: 185 },
  { name: 'Yusuf Balogun',    position: 'Attacker',   overall: 85, signingFee: 3_000, dailySalary: 150, dailyRevenue: 490 },
  { name: 'Luca Bianchi',     position: 'Defender',    overall: 81, signingFee: 1_600, dailySalary:  85, dailyRevenue: 290 },
  { name: 'Erik Svensson',    position: 'Goalkeeper',  overall: 78, signingFee: 1_100, dailySalary:  65, dailyRevenue: 215 },
  { name: 'Diego Salazar',    position: 'Attacker',   overall: 87, signingFee: 3_500, dailySalary: 175, dailyRevenue: 570 },
];

/** Returns today's 5-player pool (changes daily, consistent across all users). */
function getDailyPool() {
  const day = Math.floor(Date.now() / 86_400_000);
  const start = day % (CONTRACT_PLAYERS.length - 4);
  return CONTRACT_PLAYERS.slice(start, start + 5);
}

const contractSchema = new mongoose.Schema(
  {
    userId:       { type: String, required: true, index: true },
    playerName:   { type: String, required: true },
    position:     { type: String, required: true },
    overall:      { type: Number, required: true },
    signingFee:   { type: Number, required: true },
    dailySalary:  { type: Number, required: true },
    dailyRevenue: { type: Number, required: true },
    durationDays: { type: Number, required: true },
    startDate:    { type: Date, default: Date.now },
    endDate:      { type: Date, required: true },
    lastClaimed:  { type: Date, default: Date.now },
    status:       { type: String, enum: ['active', 'expired', 'released'], default: 'active' },
  },
  { timestamps: true }
);

/** Coins pending collection (net: revenue - salary). Capped at 48h. */
contractSchema.methods.pendingRevenue = function () {
  if (this.status !== 'active') return 0;
  const now = new Date();
  if (now > this.endDate) this.status = 'expired';
  const hoursSince = (now.getTime() - new Date(this.lastClaimed).getTime()) / 3_600_000;
  const netDaily = this.dailyRevenue - this.dailySalary;
  return Math.floor(Math.min(hoursSince, 48) / 24 * netDaily);
};

const Contract = mongoose.model('Contract', contractSchema);
module.exports = { Contract, CONTRACT_PLAYERS, getDailyPool };
