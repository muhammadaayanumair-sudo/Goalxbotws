'use strict';

const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId:   { type: String, required: true },
  username: { type: String, default: 'Unknown' },
  joinedAt: { type: Date, default: Date.now },
  wins:     { type: Number, default: 0 },
  losses:   { type: Number, default: 0 },
  eliminated: { type: Boolean, default: false },
}, { _id: false });

const tournamentSchema = new mongoose.Schema(
  {
    guildId:      { type: String, required: true, index: true },
    name:         { type: String, required: true, maxlength: 48 },
    creatorId:    { type: String, required: true },
    maxPlayers:   { type: Number, enum: [4, 8, 16], default: 8 },
    entryFee:     { type: Number, default: 0, min: 0 },
    prizePool:    { type: Number, default: 0 },
    status:       { type: String, enum: ['open', 'in_progress', 'completed'], default: 'open' },
    participants: [participantSchema],
    winnerId:     { type: String, default: null },
    startedAt:    { type: Date, default: null },
    endedAt:      { type: Date, default: null },
  },
  { timestamps: true }
);

tournamentSchema.virtual('participantCount').get(function () {
  return this.participants.length;
});

tournamentSchema.methods.isFull = function () {
  return this.participants.length >= this.maxPlayers;
};

tournamentSchema.methods.hasParticipant = function (userId) {
  return this.participants.some((p) => p.userId === userId);
};

module.exports = mongoose.model('Tournament', tournamentSchema);
