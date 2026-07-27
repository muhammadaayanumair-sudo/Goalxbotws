'use strict';

const User = require('../../models/User');
const Log = require('../../models/Log');
const config = require('../../config/config');

/**
 * EconomyService handles all economy operations: coins, XP, levels, cooldowns.
 */
class EconomyService {
  /**
   * Gets or creates a user document.
   */
  static async getUser(userId, username) {
    return User.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, username } },
      { upsert: true, new: true }
    );
  }

  /**
   * Processes the daily reward claim.
   * Returns { success, coins, streak, nextAvailable } or { success: false, remaining }
   */
  static async claimDaily(userId) {
    const user = await User.findOne({ userId });
    if (!user) throw new Error('User not found');

    const now = Date.now();
    const cooldown = config.economy.dailyCooldown;

    if (user.lastDaily && now - user.lastDaily.getTime() < cooldown) {
      const remaining = cooldown - (now - user.lastDaily.getTime());
      return { success: false, remaining };
    }

    const coins = config.economy.dailyCoins + Math.floor(user.level * 10);
    user.addCoins(coins);
    user.lastDaily = new Date();
    const { leveledUp, newLevel } = user.addXp(50);
    await user.save();

    await Log.create({
      userId,
      type: 'economy',
      action: 'daily',
      details: { coins, leveledUp, newLevel },
    }).catch(() => {});

    return { success: true, coins, leveledUp, newLevel };
  }

  /**
   * Processes the weekly reward claim.
   */
  static async claimWeekly(userId) {
    const user = await User.findOne({ userId });
    if (!user) throw new Error('User not found');

    const now = Date.now();
    const cooldown = config.economy.weeklyCooldown;

    if (user.lastWeekly && now - user.lastWeekly.getTime() < cooldown) {
      const remaining = cooldown - (now - user.lastWeekly.getTime());
      return { success: false, remaining };
    }

    const coins = config.economy.weeklyCoins + Math.floor(user.level * 50);
    user.addCoins(coins);
    user.lastWeekly = new Date();
    const { leveledUp, newLevel } = user.addXp(200);
    await user.save();

    return { success: true, coins, leveledUp, newLevel };
  }

  /**
   * Processes the work reward claim.
   */
  static async work(userId) {
    const user = await User.findOne({ userId });
    if (!user) throw new Error('User not found');

    const now = Date.now();
    const cooldown = config.economy.workCooldown;

    if (user.lastWork && now - user.lastWork.getTime() < cooldown) {
      const remaining = cooldown - (now - user.lastWork.getTime());
      return { success: false, remaining };
    }

    const min = config.economy.workCoinsMin;
    const max = config.economy.workCoinsMax;
    const coins = Math.floor(Math.random() * (max - min + 1)) + min;

    user.addCoins(coins);
    user.lastWork = new Date();
    const { leveledUp, newLevel } = user.addXp(20);
    await user.save();

    const jobs = [
      'commentated a match', 'sold match programmes', 'painted stadium seats',
      'coached youth football', 'scouted a promising talent', 'drove the team bus',
      'did stadium security', 'maintained the pitch', 'worked as a kit man',
      'filmed match highlights', 'analysed opposition footage',
    ];
    const job = jobs[Math.floor(Math.random() * jobs.length)];

    return { success: true, coins, job, leveledUp, newLevel };
  }

  /**
   * Transfers coins from one user to another.
   */
  static async transfer(fromUserId, toUserId, amount) {
    if (fromUserId === toUserId) throw new Error('Cannot transfer to yourself');
    if (amount < 1) throw new Error('Amount must be at least 1');

    const [sender, receiver] = await Promise.all([
      User.findOne({ userId: fromUserId }),
      User.findOne({ userId: toUserId }),
    ]);

    if (!sender) throw new Error('Sender not found');
    if (!receiver) throw new Error('Receiver not found');
    if (!sender.deductCoins(amount)) throw new Error('Insufficient coins');

    receiver.addCoins(amount);

    await Promise.all([sender.save(), receiver.save()]);

    await Log.create({
      userId: fromUserId,
      type: 'economy',
      action: 'transfer',
      details: { toUserId, amount },
    }).catch(() => {});

    return { success: true, amount };
  }

  /**
   * Returns the leaderboard for a guild or global.
   */
  static async getLeaderboard(guildId = null, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const query = guildId ? { guildId } : {};
    const users = await User.find(query)
      .sort({ coins: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await User.countDocuments(query);
    return { users, total, page, pages: Math.ceil(total / limit) };
  }
}

module.exports = { EconomyService };
