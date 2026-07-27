'use strict';

const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  userId:   { type: String, required: true },
  username: { type: String, default: 'Unknown' },
  role:     { type: String, enum: ['owner', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const clubSchema = new mongoose.Schema(
  {
    guildId:     { type: String, required: true, index: true },
    name:        { type: String, required: true, maxlength: 32 },
    tag:         { type: String, required: true, maxlength: 5, uppercase: true },
    description: { type: String, default: '', maxlength: 128 },
    ownerId:     { type: String, required: true },
    members:     [memberSchema],
    xp:          { type: Number, default: 0 },
    level:       { type: Number, default: 1 },
    wins:        { type: Number, default: 0 },
    losses:      { type: Number, default: 0 },
    createdAt:   { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One club name per guild
clubSchema.index({ guildId: 1, name: 1 }, { unique: true });
// One club tag per guild
clubSchema.index({ guildId: 1, tag: 1 }, { unique: true });

clubSchema.virtual('memberCount').get(function () {
  return this.members.length;
});

clubSchema.methods.hasMember = function (userId) {
  return this.members.some((m) => m.userId === userId);
};

module.exports = mongoose.model('Club', clubSchema);
