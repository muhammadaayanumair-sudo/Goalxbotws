'use strict';

const Duel = require('../../models/Duel');
const User = require('../../models/User');
const config = require('../../config/config');

const DUEL_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours to accept

/**
 * DuelService handles 1v1 prediction challenge creation, acceptance, and
 * validation. Resolution itself lives in BetResolutionScheduler since it
 * needs to happen alongside the existing fixture-finished polling loop.
 */
class DuelService {
  /**
   * Creates a pending duel challenge. Deducts the challenger's stake
   * immediately so it can't be spent elsewhere before the opponent responds;
   * refunded automatically if the duel expires or is declined.
   */
  static async createChallenge(guildId, challengerId, opponentId, { matchId, homeTeam, awayTeam, matchDate, stake, prediction }) {
    if (challengerId === opponentId) throw new Error('You cannot challenge yourself.');
    if (stake < 1) throw new Error('Stake must be at least 1 coin.');
    if (stake > config.betting.maxBet) throw new Error(`Maximum stake is ${config.betting.maxBet} coins.`);

    const matchStartTime = new Date(matchDate);
    if (matchStartTime <= new Date()) throw new Error('This match has already started or finished.');

    const challenger = await User.findOne({ userId: challengerId });
    if (!challenger) throw new Error('Your user record was not found.');
    if (!challenger.deductCoins(stake)) throw new Error(`Insufficient coins. You have ${challenger.coins} coins.`);
    await challenger.save();

    const duel = await Duel.create({
      guildId,
      challengerId,
      opponentId,
      matchId: String(matchId),
      homeTeam,
      awayTeam,
      matchDate: matchStartTime,
      stake,
      challengerPrediction: prediction,
      status: 'pending',
      expiresAt: new Date(Date.now() + DUEL_EXPIRY_MS),
    });

    return duel;
  }

  /**
   * Accepts a pending duel. Deducts the opponent's matching stake and
   * records their prediction, moving the duel to 'accepted' status where
   * it awaits automatic resolution once the match finishes.
   */
  static async acceptChallenge(duelId, opponentId, prediction) {
    const duel = await Duel.findById(duelId);
    if (!duel) throw new Error('Duel not found.');
    if (duel.opponentId !== opponentId) throw new Error('This challenge was not sent to you.');
    if (duel.status !== 'pending') throw new Error(`This duel is no longer pending (status: ${duel.status}).`);
    if (duel.expiresAt < new Date()) {
      duel.status = 'expired';
      await duel.save();
      await this._refund(duel.challengerId, duel.stake);
      throw new Error('This challenge has expired.');
    }
    if (new Date(duel.matchDate) <= new Date()) {
      duel.status = 'cancelled';
      await duel.save();
      await this._refund(duel.challengerId, duel.stake);
      throw new Error('The match has already started — this duel has been cancelled and the stake refunded.');
    }

    const opponent = await User.findOne({ userId: opponentId });
    if (!opponent) throw new Error('Your user record was not found.');
    if (!opponent.deductCoins(duel.stake)) throw new Error(`Insufficient coins. You need ${duel.stake} coins to accept.`);
    await opponent.save();

    duel.opponentPrediction = prediction;
    duel.status = 'accepted';
    await duel.save();

    return duel;
  }

  /**
   * Declines a pending duel, refunding the challenger's stake.
   */
  static async declineChallenge(duelId, opponentId) {
    const duel = await Duel.findById(duelId);
    if (!duel) throw new Error('Duel not found.');
    if (duel.opponentId !== opponentId) throw new Error('This challenge was not sent to you.');
    if (duel.status !== 'pending') throw new Error(`This duel is no longer pending (status: ${duel.status}).`);

    duel.status = 'declined';
    await duel.save();
    await this._refund(duel.challengerId, duel.stake);

    return duel;
  }

  static async _refund(userId, amount) {
    await User.findOneAndUpdate({ userId }, { $inc: { coins: amount } });
  }

  /**
   * Returns active (pending or accepted) duels involving a user.
   */
  static async getActiveDuels(userId) {
    return Duel.find({
      $or: [{ challengerId: userId }, { opponentId: userId }],
      status: { $in: ['pending', 'accepted'] },
    }).sort({ createdAt: -1 }).limit(10);
  }
}

module.exports = { DuelService };