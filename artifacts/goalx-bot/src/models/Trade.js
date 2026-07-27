'use strict';

const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema(
  {
    tradeId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },

    // Participants
    initiatorId: { type: String, required: true, index: true },
    receiverId: { type: String, required: true, index: true },

    // Offered cards (from initiator)
    offeredCards: [
      {
        cardId: String,
        playerName: String,
        rarity: String,
        overall: Number,
      },
    ],

    // Requested cards (from receiver)
    requestedCards: [
      {
        cardId: String,
        playerName: String,
        rarity: String,
        overall: Number,
      },
    ],

    // Optional coin sweetener
    coinsOffered: { type: Number, default: 0 },
    coinsRequested: { type: Number, default: 0 },

    // Trade state
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'cancelled', 'expired'],
      default: 'pending',
    },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    rejectedReason: { type: String, default: null },

    // Discord message tracking
    messageId: { type: String, default: null },
    channelId: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

const Trade = mongoose.model('Trade', tradeSchema);
module.exports = Trade;
