'use strict';

const mongoose = require('mongoose');

const autoChannelSchema = new mongoose.Schema({
  channelId: { type: String, default: null },
  enabled: { type: Boolean, default: false },
  roleId: { type: String, default: null },
  leagueIds: [{ type: String }],
  // Allow this channel to override global event toggles. If null, inherits from settings.autoPost.
  events: {
    type: Map,
    of: Boolean,
    default: new Map(),
  },
}, { _id: false });

const guildSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    guildName: { type: String, default: 'Unknown Guild' },
    ownerId: { type: String, default: null },
    icon: { type: String, default: null },
    memberCount: { type: Number, default: 0 },

    channels: {
      live: { type: autoChannelSchema, default: () => ({}) },
      fixtures: { type: autoChannelSchema, default: () => ({}) },
      results: { type: autoChannelSchema, default: () => ({}) },
      goals: { type: autoChannelSchema, default: () => ({}) },
      lineups: { type: autoChannelSchema, default: () => ({}) },
      matchday: { type: autoChannelSchema, default: () => ({}) },
      news: { type: autoChannelSchema, default: () => ({}) },
      transfers: { type: autoChannelSchema, default: () => ({}) },
      standings: { type: autoChannelSchema, default: () => ({}) },
      log: { type: String, default: null },
    },

    // Global auto-post toggles. Per-channel overrides live in channels.*.events.
    autoPost: {
      kickoff: { type: Boolean, default: true },
      goals: { type: Boolean, default: true },
      redCards: { type: Boolean, default: true },
      yellowCards: { type: Boolean, default: false },
      substitutions: { type: Boolean, default: false },
      halftime: { type: Boolean, default: true },
      fulltime: { type: Boolean, default: true },
      penalties: { type: Boolean, default: true },
      lineups: { type: Boolean, default: true },
      matchdaySummary: { type: Boolean, default: true },
      // Consolidated "live ticker" updates (every minute). If false, only discrete events post.
      liveTicker: { type: Boolean, default: false },
      // Only post events for leagues/teams the guild follows.
      followedOnly: { type: Boolean, default: false },
    },

    welcome: {
      channelId: { type: String, default: null },
      enabled: { type: Boolean, default: false },
      message: { type: String, default: null },
      returningMessage: { type: String, default: null },
      returningEnabled: { type: Boolean, default: false },
    },

    leftMembers: [{ type: String }],

    features: {
      fabrizioRomanoPosts: {
        channelId: { type: String, default: null },
        enabled: { type: Boolean, default: false },
      },
      introDm: {
        enabled: { type: Boolean, default: false },
        message: { type: String, default: null },
      },
    },

    settings: {
      prefix: { type: String, default: '/' },
      language: { type: String, default: 'en' },
      timezone: { type: String, default: 'UTC' },
      embedColor: { type: String, default: '#00D4FF' },
      deleteCommandMessages: { type: Boolean, default: false },
      ephemeralResponses: { type: Boolean, default: false },
    },

    moderation: {
      logChannel: { type: String, default: null },
      muteRole: { type: String, default: null },
      automod: { type: Boolean, default: false },
    },

    economy: {
      enabled: { type: Boolean, default: true },
      currencyName: { type: String, default: 'GoalCoins' },
      currencySymbol: { type: String, default: '🪙' },
    },

    followedLeagues: [{ type: String }],
    followedTeams: [{ type: String }],

    premium: { type: Boolean, default: false },
    premiumSince: { type: Date, default: null },
    premiumUntil: { type: Date, default: null },
    premiumBy: { type: String, default: null },

    commandsUsed: { type: Number, default: 0 },
    lastActivity: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

guildSchema.methods.setAutoChannel = function (type, channelId, options = {}) {
  if (!this.channels[type]) return false;
  this.channels[type].channelId = channelId;
  this.channels[type].enabled = true;
  if (options.roleId) this.channels[type].roleId = options.roleId;
  if (options.leagueIds) this.channels[type].leagueIds = options.leagueIds;
  if (options.events) {
    for (const [key, value] of Object.entries(options.events)) {
      this.channels[type].events.set(key, value);
    }
  }
  return true;
};

guildSchema.methods.isEventEnabled = function (eventName, channelType = null) {
  // Per-channel override wins.
  if (channelType && this.channels[channelType]?.events?.has(eventName)) {
    return this.channels[channelType].events.get(eventName);
  }
  // Fall back to global autoPost setting.
  return this.autoPost?.[eventName] ?? false;
};

const Guild = mongoose.model('Guild', guildSchema);
module.exports = Guild;
