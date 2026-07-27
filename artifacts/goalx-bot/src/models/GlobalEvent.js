'use strict';

const mongoose = require('mongoose');

const globalEventSchema = new mongoose.Schema(
  {
    active:   { type: Boolean, default: true, index: true },
    type:     { type: String, required: true, enum: ['double_xp', 'double_coins', 'double_rewards', 'sale'] },
    title:    { type: String, required: true },
    description: { type: String, default: '' },
    multiplier: { type: Number, default: 2 },
    startsAt: { type: Date, default: Date.now },
    endsAt:   { type: Date, required: true },
    createdBy: { type: String, required: true },
    announced: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

globalEventSchema.virtual('isActive').get(function () {
  const now = new Date();
  return this.active && now >= this.startsAt && now <= this.endsAt;
});

globalEventSchema.statics.getActive = async function () {
  const now = new Date();
  return this.findOne({ active: true, startsAt: { $lte: now }, endsAt: { $gte: now } }).sort({ endsAt: 1 }).lean();
};

const GlobalEvent = mongoose.model('GlobalEvent', globalEventSchema);
module.exports = GlobalEvent;
