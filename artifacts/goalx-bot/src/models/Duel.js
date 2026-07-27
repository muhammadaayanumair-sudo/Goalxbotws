'use strict';

const mongoose = require('mongoose');

/**
 * Duel - a 1v1 prediction challenge between two users on a specific fixture.
 * Both users predict the same match; whoever's prediction is closer to the
 * actual result (or exactly correct) wins the staked coins from both sides.
 */
const duelSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },

    challengerId: { type: String, required: true, index: true },
    opponentId: { type: String, required: true, index: true },

    matchId: { type: String, required: true, index: true },
    homeTeam: { type: String, required: true },
    awayTeam: { type: String, required: true },
    matchDate: { type: Date, required: true },

    stake: { type: Number, required: true, min: 1 },

    challengerPrediction: { type: String, default: null }, // e.g. "2-1"
    opponentPrediction: { type: String, default: null },

    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired', 'resolved', 'cancelled'],
      default: 'pending',
    },

    winnerId: { type: String, default: null },
    actualScore: { type: String, default: null },
    resolvedAt: { type: Date, default: null },

    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Auto-expire stale pending duels from queries (not a TTL index - status matters more than deletion)
duelSchema.index({ status: 1, expiresAt: 1 });

const Duel = mongoose.model('Duel', duelSchema);
module.exports = Duel;
