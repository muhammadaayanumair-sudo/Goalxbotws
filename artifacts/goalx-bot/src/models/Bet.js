'use strict';

const mongoose = require('mongoose');

const betSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    guildId: { type: String, required: true, index: true },

    // Match reference
    matchId: { type: String, required: true, index: true },
    homeTeam: { type: String, required: true },
    awayTeam: { type: String, required: true },
    league: { type: String, default: null },
    matchDate: { type: Date, required: true },

    // Bet details
    betType: {
      type: String,
      enum: ['winner', 'correct_score', 'btts', 'over_under', 'both_to_score'],
      required: true,
    },
    prediction: { type: String, required: true }, // e.g. "home", "2-1", "yes", "over_2.5"
    odds: { type: Number, required: true, min: 1.0 },
    amount: { type: Number, required: true, min: 1 },
    potentialWin: { type: Number, required: true },

    // Resolution
    status: {
      type: String,
      enum: ['pending', 'won', 'lost', 'void', 'cancelled'],
      default: 'pending',
    },
    result: { type: String, default: null },         // actual match result
    actualScore: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    coinsAwarded: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: profit/loss
betSchema.virtual('profitLoss').get(function () {
  if (this.status === 'won') return this.coinsAwarded - this.amount;
  if (this.status === 'lost') return -this.amount;
  return 0;
});

const Bet = mongoose.model('Bet', betSchema);
module.exports = Bet;
