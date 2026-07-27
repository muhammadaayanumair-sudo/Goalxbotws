'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { v4: uuidv4 } = require('uuid');
const Auction = require('../../models/Auction');
const Card = require('../../models/Card');
const User = require('../../models/User');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auction')
    .setDescription('🔨 Manage card auctions')
    .addSubcommand((sub) =>
      sub.setName('create')
        .setDescription('🔨 Start an auction for one of your cards')
        .addStringOption((opt) => opt.setName('cardid').setDescription('🔨 Card ID to auction').setRequired(true))
        .addIntegerOption((opt) => opt.setName('startbid').setDescription('🔨 Starting bid in coins').setRequired(true).setMinValue(50))
        .addIntegerOption((opt) => opt.setName('duration').setDescription('🔨 Duration in hours (1-72)').setRequired(true).setMinValue(1).setMaxValue(72))
        .addIntegerOption((opt) => opt.setName('buynow').setDescription('🔨 Optional buy-now price').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName('bid')
        .setDescription('🔨 Place a bid on an active auction')
        .addStringOption((opt) => opt.setName('auctionid').setDescription('🔨 Auction ID').setRequired(true))
        .addIntegerOption((opt) => opt.setName('amount').setDescription('🔨 Your bid amount').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub.setName('list')
        .setDescription('🔨 Browse active auctions')
    )
    .addSubcommand((sub) =>
      sub.setName('cancel')
        .setDescription('🔨 Cancel your auction (only if no bids)')
        .addStringOption((opt) => opt.setName('auctionid').setDescription('🔨 Auction ID to cancel').setRequired(true))
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      const sub = interaction.options.getSubcommand();

      if (sub === 'create') {
        await interaction.deferReply();
        const cardIdInput = interaction.options.getString('cardid');
        const startBid = interaction.options.getInteger('startbid');
        const durationHours = interaction.options.getInteger('duration');
        const buyNow = interaction.options.getInteger('buynow');

        const card = await Card.findOne({ cardId: { $regex: `^${cardIdInput}` }, ownerId: interaction.user.id });
        if (!card) return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', 'Card not found or not owned by you.')] });
        if (card.locked) return interaction.editReply({ embeds: [EmbedFactory.error('Locked', 'This card is locked.')] });
        if (card.inAuction) return interaction.editReply({ embeds: [EmbedFactory.error('Active', 'This card is already in an auction.')] });
        if (card.forSale) return interaction.editReply({ embeds: [EmbedFactory.error('Listed', 'Delist from marketplace first.')] });

        const auctionId = uuidv4().slice(0, 8).toUpperCase();
        const endsAt = new Date(Date.now() + durationHours * 3_600_000);

        const auction = await Auction.create({
          auctionId,
          guildId: interaction.guildId || 'dm',
          sellerId: interaction.user.id,
          cardId: card.cardId,
          cardSnapshot: {
            playerName: card.playerName,
            teamName: card.teamName,
            rarity: card.rarity,
            overall: card.stats.overall,
            position: card.position,
            season: card.season,
          },
          startingBid: startBid,
          buyNowPrice: buyNow || null,
          currentBid: 0,
          startsAt: new Date(),
          endsAt,
          status: 'active',
          channelId: interaction.channelId,
        });

        card.inAuction = true;
        card.auctionId = auctionId;
        await card.save();

        const embed = EmbedFactory.base(`🔨 Auction Started — **${card.playerName}**`)
          .setColor('#9B59B6')
          .addFields(
            { name: '🔨 Card', value: `${card.playerName} (${card.rarity}) · OVR ${card.stats.overall}`, inline: true },
            { name: '🔨 Starting Bid', value: formatCoins(startBid), inline: true },
            { name: '🔨 Ends', value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`, inline: true },
            { name: '🔨 Auction ID', value: `\`${auctionId}\``, inline: true },
            ...(buyNow ? [{ name: '🔨 Buy Now', value: formatCoins(buyNow), inline: true }] : [])
          )
          .setFooter({ text: 'Use /auction bid <id> <amount> to place a bid' });

        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'bid') {
        await interaction.deferReply();
        const auctionIdInput = interaction.options.getString('auctionid');
        const amount = interaction.options.getInteger('amount');

        const auction = await Auction.findOne({ auctionId: auctionIdInput.toUpperCase(), status: 'active' });
        if (!auction) return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', 'Active auction not found.')] });
        if (auction.sellerId === interaction.user.id) return interaction.editReply({ embeds: [EmbedFactory.error('Error', 'You cannot bid on your own auction.')] });
        if (new Date() > auction.endsAt) return interaction.editReply({ embeds: [EmbedFactory.error('Ended', 'This auction has already ended.')] });

        const minBid = auction.currentBid > 0
          ? auction.currentBid + auction.minIncrement
          : auction.startingBid;

        if (amount < minBid) {
          return interaction.editReply({ embeds: [EmbedFactory.error('Bid Too Low', `Minimum bid is ${formatCoins(minBid)}.`)] });
        }

        const bidder = await User.findOne({ userId: interaction.user.id });
        if (!bidder) return interaction.editReply({ embeds: [EmbedFactory.error('Error', 'User not found.')] });
        if (bidder.coins < amount) {
          return interaction.editReply({ embeds: [EmbedFactory.error('Insufficient Coins', `You need ${formatCoins(amount)}.`)] });
        }

        // Refund previous high bidder
        if (auction.currentBidderId) {
          await User.findOneAndUpdate(
            { userId: auction.currentBidderId },
            { $inc: { coins: auction.currentBid } }
          );
        }

        // Deduct coins from new bidder
        bidder.deductCoins(amount);
        await bidder.save();

        auction.bids.push({ userId: interaction.user.id, amount, placedAt: new Date() });
        auction.currentBid = amount;
        auction.currentBidderId = interaction.user.id;
        auction.bidCount += 1;

        // Handle buy-now
        if (auction.buyNowPrice && amount >= auction.buyNowPrice) {
          auction.status = 'sold';
          auction.winnerId = interaction.user.id;
          auction.finalPrice = amount;
          auction.completedAt = new Date();

          await Card.findOneAndUpdate({ cardId: auction.cardId }, {
            $set: { ownerId: interaction.user.id, inAuction: false, auctionId: null, obtainedFrom: 'auction' },
            $push: { previousOwners: auction.sellerId },
          });
          await User.findOneAndUpdate({ userId: auction.sellerId }, { $inc: { coins: amount, totalEarned: amount } });
        }

        await auction.save();

        const isBuyNow = auction.status === 'sold';
        const embed = isBuyNow
          ? EmbedFactory.success('⚡ Buy Now — Card Purchased!', `You bought **${auction.cardSnapshot.playerName}** for ${formatCoins(amount)}!`)
          : EmbedFactory.success(`Bid Placed! 🔨`, `Your bid of ${formatCoins(amount)} on **${auction.cardSnapshot.playerName}** is now the highest!\n\nAuction ends: <t:${Math.floor(auction.endsAt.getTime() / 1000)}:R>`);

        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'list') {
        await interaction.deferReply();
        const auctions = await Auction.find({ status: 'active' }).sort({ endsAt: 1 }).limit(10).lean();

        if (!auctions.length) {
          return interaction.editReply({ embeds: [EmbedFactory.warning('No Auctions', 'No active auctions right now.')] });
        }

        const embed = EmbedFactory.base('🔨 **Active Auctions**')
          .setDescription(`*${auctions.length} active auction(s)*\n`);

        for (const a of auctions) {
          embed.addFields({
            name: `**${a.cardSnapshot.playerName}** (${a.cardSnapshot.rarity}) — OVR ${a.cardSnapshot.overall}`,
            value: [
              `💰 Current Bid: **${formatCoins(a.currentBid || a.startingBid)}**`,
              `🎯 Bids: ${a.bidCount}`,
              `⏰ Ends: <t:${Math.floor(new Date(a.endsAt).getTime() / 1000)}:R>`,
              `🆔 ID: \`${a.auctionId}\``,
            ].join(' · '),
            inline: false,
          });
        }

        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === 'cancel') {
        const auctionIdInput = interaction.options.getString('auctionid');
        const auction = await Auction.findOne({ auctionId: auctionIdInput.toUpperCase(), sellerId: interaction.user.id, status: 'active' });

        if (!auction) return interaction.reply({ embeds: [EmbedFactory.error('Not Found', 'Auction not found or not owned by you.')], ephemeral: true });
        if (auction.bidCount > 0) return interaction.reply({ embeds: [EmbedFactory.error('Has Bids', 'Cannot cancel an auction that already has bids.')], ephemeral: true });

        auction.status = 'cancelled';
        await auction.save();
        await Card.findOneAndUpdate({ cardId: auction.cardId }, { $set: { inAuction: false, auctionId: null } });

        return interaction.reply({ embeds: [EmbedFactory.success('Auction Cancelled', `Auction \`${auction.auctionId}\` has been cancelled.`)], ephemeral: true });
      }
    } catch (error) {
    logger.error(`[${interaction.commandName}] execute error:`, error);
    const msg = {
      embeds: [EmbedFactory.error('Something went wrong', error.message || 'An unexpected error occurred. Please try again.')],
      ephemeral: true,
    };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch (_) { /* interaction already timed out */ }
  }
},
};
