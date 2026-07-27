'use strict';

const Auction = require('../models/Auction');
const Card = require('../models/Card');
const User = require('../models/User');
const { EmbedBuilder } = require('discord.js');
const { logger } = require('../utils/logger');

/** Maps rarity → emoji + color for premium embeds */
function rarityStyle(rarity) {
  const map = {
    common:     { emoji: '⚪', color: '#95A5A6' },
    uncommon:   { emoji: '🟢', color: '#2ECC71' },
    rare:       { emoji: '🔵', color: '#3498DB' },
    epic:       { emoji: '🟣', color: '#9B59B6' },
    legendary:  { emoji: '🟡', color: '#F1C40F' },
    mythic:     { emoji: '🔴', color: '#E74C3C' },
  };
  return map[rarity?.toLowerCase()] || { emoji: '⚽', color: '#3498DB' };
}

function formatCoins(n) {
  if (n === undefined || n === null) return '0';
  return n.toLocaleString() + ' 🪙';
}

/**
 * AuctionScheduler resolves auctions that have reached their end time.
 * Sends premium celebratory embeds when auctions sell, and refund notices
 * when no bids are placed.
 */
class AuctionScheduler {
  constructor(client) {
    this.client = client;
  }

  async run() {
    const expiredAuctions = await Auction.find({
      status: 'active',
      endsAt: { $lte: new Date() },
    }).limit(20);

    for (const auction of expiredAuctions) {
      try {
        if (auction.currentBidderId && auction.currentBid > 0) {
          // Auction won
          await Card.findOneAndUpdate(
            { cardId: auction.cardId },
            {
              $set: {
                ownerId: auction.currentBidderId,
                forSale: false,
                inAuction: false,
                auctionId: null,
                obtainedFrom: 'auction',
              },
              $push: { previousOwners: auction.sellerId },
              $inc: { timesTraded: 1 },
            }
          );

          await User.findOneAndUpdate(
            { userId: auction.sellerId },
            { $inc: { coins: auction.currentBid, totalEarned: auction.currentBid } }
          );

          auction.status = 'sold';
          auction.winnerId = auction.currentBidderId;
          auction.finalPrice = auction.currentBid;
          auction.completedAt = new Date();
          await auction.save();

          logger.info(`[AuctionScheduler] Auction ${auction.auctionId} sold for ${auction.currentBid} coins`);

          // Premium celebration embed
          if (auction.channelId) {
            const channel = await this.client.channels.fetch(auction.channelId).catch(() => null);
            if (channel) {
              const style = rarityStyle(auction.cardSnapshot?.rarity);
              const embed = new EmbedBuilder()
                .setColor(style.color)
                .setTitle(`🎉 Auction Sold! ${style.emoji} ${auction.cardSnapshot?.playerName || 'Card'}`)
                .setDescription(`The auction has ended and a new owner has been crowned!`)
                .addFields(
                  { name: '👑 Winner', value: `<@${auction.currentBidderId}>`, inline: true },
                  { name: '💰 Final Price', value: formatCoins(auction.currentBid), inline: true },
                  { name: '🎯 Total Bids', value: `${auction.bidCount}`, inline: true },
                  { name: '👋 Sold By', value: `<@${auction.sellerId}>`, inline: true },
                  { name: '⭐ Rarity', value: `${style.emoji} ${auction.cardSnapshot?.rarity || 'Unknown'}`, inline: true },
                  { name: '🏆 OVR', value: `${auction.cardSnapshot?.overall ?? '?'}`, inline: true },
                )
                .setFooter({ text: `⚽ GoalX Auctions · Fair & Fast` })
                .setTimestamp();
              await channel.send({ embeds: [embed] }).catch(() => {});
            }
          }
        } else {
          // No bids
          await Card.findOneAndUpdate(
            { cardId: auction.cardId },
            { $set: { forSale: false, inAuction: false, auctionId: null } }
          );
          auction.status = 'no_bids';
          auction.completedAt = new Date();
          await auction.save();

          logger.info(`[AuctionScheduler] Auction ${auction.auctionId} ended with no bids`);

          if (auction.channelId) {
            const channel = await this.client.channels.fetch(auction.channelId).catch(() => null);
            if (channel) {
              const style = rarityStyle(auction.cardSnapshot?.rarity);
              const embed = new EmbedBuilder()
                .setColor('#95A5A6')
                .setTitle(`⏰ Auction Ended — No Bids`)
                .setDescription(`**${auction.cardSnapshot?.playerName || 'Card'}** (${style.emoji} ${auction.cardSnapshot?.rarity || 'Unknown'}) received no bids and has been returned to <@${auction.sellerId}>.`)
                .setFooter({ text: `⚽ GoalX Auctions · Try a lower starting bid next time!` })
                .setTimestamp();
              await channel.send({ embeds: [embed] }).catch(() => {});
            }
          }
        }
      } catch (err) {
        logger.error(`[AuctionScheduler] Error resolving auction ${auction.auctionId}:`, err.message);
      }
    }
  }
}

module.exports = { AuctionScheduler };
