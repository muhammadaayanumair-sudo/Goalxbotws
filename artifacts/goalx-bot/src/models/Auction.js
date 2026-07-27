'use strict';

const mongoose = require('mongoose');

const auctionSchema = new mongoose.Schema(
  {
    auctionId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    sellerId: { type: String, required: true, index: true },

    // Card being auctioned
    cardId: { type: String, required: true, index: true },
    cardSnapshot: {
      playerName: String,
      teamName: String,
      rarity: String,
      overall: Number,
      position: String,
      season: String,
    },

    // Auction settings
    startingBid: { type: Number, required: true, min: 1 },
    minIncrement: { type: Number, default: 50 },
    buyNowPrice: { type: Number, default: null },

    // Current state
    currentBid: { type: Number, default: 0 },
    currentBidderId: { type: String, default: null },
    bidCount: { type: Number, default: 0 },

    // Bid history
    bids: [
      {
        userId: String,
        amount: Number,
        placedAt: { type: Date, default: Date.now },
      },
    ],

    // Timing
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true, index: true },

    // Resolution
    status: {
      type: String,
      enum: ['pending', 'active', 'ended', 'sold', 'cancelled', 'no_bids'],
      default: 'pending',
    },
    winnerId: { type: String, default: null },
    finalPrice: { type: Number, default: null },
    completedAt: { type: Date, default: null },

    // Discord tracking
    messageId: { type: String, default: null },
    channelId: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: time remaining in seconds
auctionSchema.virtual('timeRemaining').get(function () {
  const remaining = Math.max(0, this.endsAt - Date.now());
  return Math.floor(remaining / 1000);
});

const Auction = mongoose.model('Auction', auctionSchema);
module.exports = Auction;
