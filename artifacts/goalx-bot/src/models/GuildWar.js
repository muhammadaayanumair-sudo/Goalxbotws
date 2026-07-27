'use strict';

const mongoose = require('mongoose');

const guildWarSchema = new mongoose.Schema(
  {
    guildId:     { type: String, required: true, index: true },
    opponentId:  { type: String, required: true, index: true },
    guildName:   { type: String, default: 'Unknown' },
    opponentName:{ type: String, default: 'Unknown' },
    status:      { type: String, default: 'active', enum: ['active', 'won', 'lost', 'draw'] },
    startDate:   { type: Date, default: Date.now },
    endDate:     { type: Date, required: true },
    guildScore:  { type: Number, default: 0 },
    opponentScore: { type: Number, default: 0 },
    betPoints:   { type: Number, default: 0 }, // points earned from bets during war
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

guildWarSchema.virtual('result').get(function () {
  if (this.status !== 'active') return this.status;
  const now = new Date();
  if (now > this.endDate) {
    if (this.guildScore > this.opponentScore) return 'won';
    if (this.guildScore < this.opponentScore) return 'lost';
    return 'draw';
  }
  return 'active';
});

guildWarSchema.statics.getActiveForGuild = async function (guildId) {
  return this.findOne({ guildId, status: 'active', endDate: { $gte: new Date() } }).lean();
};

guildWarSchema.statics.getLeaderboard = async function (limit = 10) {
  return this.aggregate([
    { $match: { status: { $in: ['won', 'lost', 'draw'] } } },
    {
      $group: {
        _id: '$guildId',
        name: { $first: '$guildName' },
        wins: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
        losses: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
        totalScore: { $sum: '$guildScore' },
      },
    },
    { $sort: { wins: -1, totalScore: -1 } },
    { $limit: limit },
  ]);
};

const GuildWar = mongoose.model('GuildWar', guildWarSchema);
module.exports = GuildWar;
