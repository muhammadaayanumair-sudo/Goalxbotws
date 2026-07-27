'use strict';

const mongoose = require('mongoose');

const logSchema = new mongoose.Schema(
  {
    guildId: { type: String, index: true },
    userId: { type: String, index: true },
    type: {
      type: String,
      enum: [
        'command', 'economy', 'card', 'trade', 'bet',
        'moderation', 'admin', 'error', 'api', 'autopost',
      ],
      required: true,
      index: true,
    },
    action: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    success: { type: Boolean, default: true },
    errorMessage: { type: String, default: null },
    ipAddress: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

// Auto-expire logs after 90 days
logSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7_776_000 });

const Log = mongoose.model('Log', logSchema);
module.exports = Log;
