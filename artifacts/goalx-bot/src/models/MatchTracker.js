'use strict';

const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['KICKOFF', 'GOAL', 'OWN_GOAL', 'PENALTY', 'RED_CARD', 'YELLOW_CARD', 'SECOND_YELLOW', 'SUBSTITUTION', 'HALFTIME', 'FULLTIME', 'PENALTY_SHOOTOUT', 'LIVE_UPDATE', 'SUSPENDED', 'POSTPONED'],
    required: true,
  },
  minute: { type: String, default: null },
  team: { type: String, default: null },
  player: { type: String, default: null },
  assist: { type: String, default: null },
  detail: { type: String, default: null },
  homeGoals: { type: Number, default: null },
  awayGoals: { type: Number, default: null },
  posted: { type: Boolean, default: false },
  postedAt: { type: Date, default: null },
}, { _id: false, timestamps: false });

const matchTrackerSchema = new mongoose.Schema(
  {
    fixtureId: { type: String, required: true, unique: true },
    leagueId: { type: String, default: null, index: true },
    leagueName: { type: String, default: 'Unknown League' },
    leagueLogo: { type: String, default: null },
    country: { type: String, default: null },

    homeId: { type: String, default: null },
    homeName: { type: String, default: 'Home' },
    homeLogo: { type: String, default: null },
    homeScore: { type: Number, default: 0 },

    awayId: { type: String, default: null },
    awayName: { type: String, default: 'Away' },
    awayLogo: { type: String, default: null },
    awayScore: { type: Number, default: 0 },

    status: { type: String, default: 'NS' },
    elapsed: { type: Number, default: null },
    venue: { type: String, default: null },
    date: { type: Date, default: null },

    // Events we have detected and posted (or not posted) to guilds.
    events: { type: [eventSchema], default: [] },

    // Tracks which guilds have already received which event types for this match.
    // guildId -> { eventKey: true, ... } so we can avoid double-posting if a guild
    // has multiple overlapping channels (e.g., live + goals).
    guildDeliveries: { type: Map, of: mongoose.Schema.Types.Mixed, default: new Map() },

    // Last known state signature used to detect changes.
    stateSignature: { type: String, default: '' },

    // Signature of score+status only (no elapsed time). Used to detect meaningful
    // state changes without triggering on every clock tick.
    changeSignature: { type: String, default: '' },

    // When the match was first seen and last updated.
    firstSeenAt: { type: Date, default: Date.now },
    lastUpdatedAt: { type: Date, default: Date.now },

    // Soft-delete / archive finished matches after a while.
    finishedAt: { type: Date, default: null },
    archived: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

matchTrackerSchema.index({ status: 1, lastUpdatedAt: 1 });
matchTrackerSchema.index({ archived: 1, finishedAt: 1 });
matchTrackerSchema.index({ leagueId: 1, status: 1 });

// Virtual to quickly get the current score string.
matchTrackerSchema.virtual('scoreLine').get(function () {
  return `${this.homeScore}–${this.awayScore}`;
});

// Helper to build a unique delivery key for a guild/event.
matchTrackerSchema.methods.hasDeliveredTo = function (guildId, eventKey) {
  const deliveries = this.guildDeliveries?.get?.(String(guildId)) || {};
  return !!deliveries[eventKey];
};

matchTrackerSchema.methods.markDeliveredTo = function (guildId, eventKey) {
  const id = String(guildId);
  const deliveries = this.guildDeliveries?.get?.(id) || {};
  deliveries[eventKey] = true;
  this.guildDeliveries.set(id, deliveries);
};

const MatchTracker = mongoose.models.MatchTracker || mongoose.model('MatchTracker', matchTrackerSchema);
module.exports = MatchTracker;
