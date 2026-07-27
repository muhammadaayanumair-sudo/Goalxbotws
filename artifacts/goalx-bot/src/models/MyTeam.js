'use strict';

const mongoose = require('mongoose');

const playerSlotSchema = new mongoose.Schema({
  cardId:     { type: String, required: true },
  playerName: { type: String, required: true },
  teamName:   { type: String, required: true },
  position:   { type: String, required: true }, // Goalkeeper, Defender, Midfielder, Attacker
  rarity:     { type: String, required: true },
  overall:    { type: Number, required: true },
  pace:       { type: Number, default: 50 },
  shooting:   { type: Number, default: 50 },
  passing:    { type: Number, default: 50 },
  dribbling:  { type: Number, default: 50 },
  defending:  { type: Number, default: 50 },
  physical:   { type: Number, default: 50 },
  slotIndex:  { type: Number, required: true }, // 0-10 (0=GK, 1-4=DEF, 5-7=MID, 8-10=ATT)
}, { _id: false });

const myTeamSchema = new mongoose.Schema(
  {
    userId:    { type: String, required: true, unique: true, index: true },
    teamName:  { type: String, default: 'My Team' },
    formation: { type: String, default: '4-3-3' },

    // Exactly 11 player slots (index 0-10)
    players: {
      type: [playerSlotSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 11,
        message: 'A team cannot have more than 11 players',
      },
    },

    // Team rating = average of all 11 players' overall
    teamRating: { type: Number, default: 0 },

    // Customization
    motto:  { type: String, default: null, maxlength: 120 },
    tactic: { type: String, default: 'Balanced' },

    // Total stats (sum across all players)
    totalStats: {
      pace:       { type: Number, default: 0 },
      shooting:   { type: Number, default: 0 },
      passing:    { type: Number, default: 0 },
      dribbling:  { type: Number, default: 0 },
      defending:  { type: Number, default: 0 },
      physical:   { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Recalculates teamRating and totalStats from current players array.
 * Call this after any add/remove operation then save.
 */
myTeamSchema.methods.recalculate = function () {
  if (!this.players.length) {
    this.teamRating = 0;
    this.totalStats = { pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0 };
    return;
  }

  const sum = (key) => this.players.reduce((a, p) => a + (p[key] || 0), 0);
  const count = this.players.length;

  this.teamRating   = Math.round(sum('overall') / count);
  this.totalStats   = {
    pace:       Math.round(sum('pace')       / count),
    shooting:   Math.round(sum('shooting')   / count),
    passing:    Math.round(sum('passing')    / count),
    dribbling:  Math.round(sum('dribbling')  / count),
    defending:  Math.round(sum('defending')  / count),
    physical:   Math.round(sum('physical')   / count),
  };
};

/**
 * Virtual: positions filled (e.g. "9/11")
 */
myTeamSchema.virtual('filledSlots').get(function () {
  return this.players.length;
});

/**
 * Virtual: whether the team is complete (11 players)
 */
myTeamSchema.virtual('isComplete').get(function () {
  return this.players.length === 11;
});

const MyTeam = mongoose.model('MyTeam', myTeamSchema);
module.exports = MyTeam;
