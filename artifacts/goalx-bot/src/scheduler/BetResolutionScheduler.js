'use strict';

const Bet = require('../models/Bet');
const Duel = require('../models/Duel');
const User = require('../models/User');
const { EmbedBuilder } = require('discord.js');
const { FootballApiManager } = require('../services/FootballApiManager');
const { BettingService } = require('../services/betting/BettingService');
const { logger } = require('../utils/logger');

function formatCoins(n) {
  if (n === undefined || n === null) return '0';
  return n.toLocaleString() + ' 🪙';
}

/**
 * BetResolutionScheduler checks pending bets AND duels, resolving both
 * when their matches finish. Sends premium DM notifications to winners
 * and losers so users always know the outcome.
 */
class BetResolutionScheduler {
  constructor(client) {
    this.client = client;
  }

  async run() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 105 * 60 * 1000);

    const [pendingBetMatchIds, pendingDuelMatchIds] = await Promise.all([
      Bet.find({ status: 'pending', matchDate: { $lte: cutoff } }).distinct('matchId'),
      Duel.find({ status: 'accepted', matchDate: { $lte: cutoff } }).distinct('matchId'),
    ]);

    const allMatchIds = [...new Set([...pendingBetMatchIds, ...pendingDuelMatchIds])];
    if (!allMatchIds.length) return;

    const api = new FootballApiManager(this.client.cache);

    for (const matchId of allMatchIds) {
      try {
        const fixtures = await api.getFixtureById(parseInt(matchId));
        const fixture = fixtures?.[0];
        if (!fixture) continue;

        const status = fixture.fixture?.status?.short;
        const isFinished = ['FT', 'AET', 'PEN'].includes(status);
        if (!isFinished) continue;

        const homeGoals = fixture.goals?.home ?? 0;
        const awayGoals = fixture.goals?.away ?? 0;
        const homeName = fixture.teams?.home?.name || 'Home';
        const awayName = fixture.teams?.away?.name || 'Away';
        const actualScore = `${homeGoals}-${awayGoals}`;

        if (pendingBetMatchIds.includes(matchId)) {
          const resolved = await BettingService.resolveMatchBets(matchId, {
            homeGoals, awayGoals,
            homeScore: String(homeGoals), awayScore: String(awayGoals),
          });
          if (resolved > 0) {
            logger.info(`[BetResolutionScheduler] Resolved ${resolved} bets for match ${matchId} (${actualScore})`);
            // Notify winners by DM
            await this._notifyBetWinners(matchId, homeName, awayName, actualScore);
          }
        }

        if (pendingDuelMatchIds.includes(matchId)) {
          const resolvedDuels = await this._resolveDuels(matchId, homeGoals, awayGoals, homeName, awayName);
          if (resolvedDuels > 0) {
            logger.info(`[BetResolutionScheduler] Resolved ${resolvedDuels} duel(s) for match ${matchId} (${actualScore})`);
          }
        }
      } catch (err) {
        logger.error(`[BetResolutionScheduler] Error resolving match ${matchId}:`, err.message);
      }
    }
  }

  /**
   * DM winners with a celebration embed, losers with a graceful loss embed.
   */
  async _notifyBetWinners(matchId, homeName, awayName, actualScore) {
    const winningBets = await Bet.find({ matchId, status: 'won' }).lean();
    for (const bet of winningBets) {
      try {
        const user = await this.client.users.fetch(bet.userId).catch(() => null);
        if (!user) continue;
        const embed = new EmbedBuilder()
          .setColor('#2ECC71')
          .setTitle(`🎉 Bet Won!`)
          .setDescription(`Your bet on **${homeName} vs ${awayName}** was correct!

**Final score:** ${actualScore}
**You won:** ${formatCoins(bet.payout)}`)
          .setFooter({ text: `⚽ GoalX Betting · Congrats!` })
          .setTimestamp();
        await user.send({ embeds: [embed] }).catch(() => {});
      } catch (_) { /* ignore DM failures */ }
    }

    const losingBets = await Bet.find({ matchId, status: 'lost' }).lean();
    for (const bet of losingBets) {
      try {
        const user = await this.client.users.fetch(bet.userId).catch(() => null);
        if (!user) continue;
        const embed = new EmbedBuilder()
          .setColor('#E74C3C')
          .setTitle(`📉 Bet Lost`)
          .setDescription(`Your bet on **${homeName} vs ${awayName}** didn't hit.

**Final score:** ${actualScore}
**Stake lost:** ${formatCoins(bet.amount)}`)
          .setFooter({ text: `⚽ GoalX Betting · Better luck next match!` })
          .setTimestamp();
        await user.send({ embeds: [embed] }).catch(() => {});
      } catch (_) { /* ignore DM failures */ }
    }
  }

  /**
   * Resolves duels with premium DM notifications for both players.
   */
  async _resolveDuels(matchId, homeGoals, awayGoals, homeName, awayName) {
    const duels = await Duel.find({ matchId, status: 'accepted' });
    if (!duels.length) return 0;

    const actualScore = `${homeGoals}-${awayGoals}`;
    let resolvedCount = 0;

    for (const duel of duels) {
      const scoreDistance = (prediction) => {
        const match = /^(\d+)-(\d+)$/.exec(prediction || '');
        if (!match) return Infinity;
        const [, h, a] = match;
        return Math.abs(parseInt(h) - homeGoals) + Math.abs(parseInt(a) - awayGoals);
      };

      const challengerDist = scoreDistance(duel.challengerPrediction);
      const opponentDist = scoreDistance(duel.opponentPrediction);

      const pot = duel.stake * 2;
      let winnerId = null;

      if (challengerDist < opponentDist) {
        winnerId = duel.challengerId;
      } else if (opponentDist < challengerDist) {
        winnerId = duel.opponentId;
      }

      if (winnerId) {
        const winner = await User.findOne({ userId: winnerId });
        if (winner) {
          winner.addCoins(pot);
          await winner.save();
        }
      } else {
        await User.findOneAndUpdate({ userId: duel.challengerId }, { $inc: { coins: duel.stake } });
        await User.findOneAndUpdate({ userId: duel.opponentId }, { $inc: { coins: duel.stake } });
      }

      duel.status = 'resolved';
      duel.winnerId = winnerId;
      duel.actualScore = actualScore;
      duel.resolvedAt = new Date();
      await duel.save();

      // DM both players
      await this._notifyDuelPlayers(duel, homeName, awayName, actualScore, winnerId, pot);

      resolvedCount++;
    }

    return resolvedCount;
  }

  async _notifyDuelPlayers(duel, homeName, awayName, actualScore, winnerId, pot) {
    const players = [
      { id: duel.challengerId, prediction: duel.challengerPrediction },
      { id: duel.opponentId, prediction: duel.opponentPrediction },
    ];

    for (const player of players) {
      try {
        const user = await this.client.users.fetch(player.id).catch(() => null);
        if (!user) continue;

        const isWinner = winnerId === player.id;
        const isTie = !winnerId;
        const embed = new EmbedBuilder()
          .setColor(isWinner ? '#2ECC71' : isTie ? '#F1C40F' : '#E74C3C')
          .setTitle(isWinner ? '🎉 Duel Won!' : isTie ? '⚖️ Duel Tie' : '📉 Duel Lost')
          .setDescription(
            `**${homeName} vs ${awayName}**
**Final score:** ${actualScore}

Your prediction: **${player.prediction || 'N/A'}**` +
            (isWinner ? `

🏆 You won the pot of ${formatCoins(pot)}!` :
             isTie ? `

⚖️ It was a draw! Your ${formatCoins(duel.stake)} stake has been refunded.` :
             `

Better luck next time!`)
          )
          .setFooter({ text: `⚽ GoalX Duels · Score Prediction Battles` })
          .setTimestamp();

        await user.send({ embeds: [embed] }).catch(() => {});
      } catch (_) { /* ignore DM failures */ }
    }
  }
}

module.exports = { BetResolutionScheduler };
