'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { v4: uuidv4 } = require('uuid');
const Trade = require('../../models/Trade');
const Card = require('../../models/Card');
const User = require('../../models/User');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('🤝 Trade cards with another player')
    .addSubcommand((sub) =>
      sub.setName('offer')
        .setDescription('🤝 Send a trade offer to another player')
        .addUserOption((opt) => opt.setName('user').setDescription('🤝 User to trade with').setRequired(true))
        .addStringOption((opt) => opt.setName('offercardid').setDescription('🤝 Your card ID to offer (first 8 chars)').setRequired(true))
        .addStringOption((opt) => opt.setName('requestcardid').setDescription('🤝 Their card ID you want (first 8 chars)').setRequired(true))
        .addIntegerOption((opt) => opt.setName('addcoins').setDescription('🤝 Extra coins to sweeten your offer').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName('pending')
        .setDescription('🤝 View your pending trade offers')
    ),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      const sub = interaction.options.getSubcommand();

      if (sub === 'offer') {
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user');
        const offerCardId = interaction.options.getString('offercardid');
        const requestCardId = interaction.options.getString('requestcardid');
        const coinsOffered = interaction.options.getInteger('addcoins') || 0;

        if (targetUser.id === interaction.user.id) return interaction.editReply({ embeds: [EmbedFactory.error('Invalid', 'You cannot trade with yourself.')] });
        if (targetUser.bot) return interaction.editReply({ embeds: [EmbedFactory.error('Invalid', 'You cannot trade with a bot.')] });

        const [myCard, theirCard] = await Promise.all([
          Card.findOne({ cardId: { $regex: `^${offerCardId}` }, ownerId: interaction.user.id }),
          Card.findOne({ cardId: { $regex: `^${requestCardId}` }, ownerId: targetUser.id }),
        ]);

        if (!myCard) return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', 'Your card not found or not owned by you.')] });
        if (!theirCard) return interaction.editReply({ embeds: [EmbedFactory.error('Not Found', 'Their card not found or not owned by them.')] });
        if (myCard.locked) return interaction.editReply({ embeds: [EmbedFactory.error('Locked', 'Your card is locked.')] });
        if (theirCard.locked) return interaction.editReply({ embeds: [EmbedFactory.error('Locked', 'Their card is locked.')] });

        if (coinsOffered > 0) {
          const sender = await User.findOne({ userId: interaction.user.id });
          if (!sender || sender.coins < coinsOffered) {
            return interaction.editReply({ embeds: [EmbedFactory.error('Insufficient Coins', `You don't have ${coinsOffered.toLocaleString()} coins.`)] });
          }
        }

        const tradeId = uuidv4().slice(0, 8).toUpperCase();
        const expiresAt = new Date(Date.now() + 24 * 3_600_000); // 24 hours

        const trade = await Trade.create({
          tradeId,
          guildId: interaction.guildId || 'dm',
          initiatorId: interaction.user.id,
          receiverId: targetUser.id,
          offeredCards: [{ cardId: myCard.cardId, playerName: myCard.playerName, rarity: myCard.rarity, overall: myCard.stats.overall }],
          requestedCards: [{ cardId: theirCard.cardId, playerName: theirCard.playerName, rarity: theirCard.rarity, overall: theirCard.stats.overall }],
          coinsOffered,
          expiresAt,
          channelId: interaction.channelId,
        });

        const embed = EmbedFactory.base(`🔄 Trade Offer — \`${tradeId}\``)
          .setColor('#3498DB')
          .setDescription(`**${interaction.user.username}** wants to trade with **${targetUser.username}**\n`)
          .addFields(
            {
              name: `📤 ${interaction.user.username} Offers`,
              value: `**${myCard.playerName}** (${myCard.rarity}) · OVR ${myCard.stats.overall}${coinsOffered > 0 ? `\n+ 🪙 ${coinsOffered.toLocaleString()} coins` : ''}`,
              inline: true,
            },
            {
              name: `📥 ${targetUser.username} Sends`,
              value: `**${theirCard.playerName}** (${theirCard.rarity}) · OVR ${theirCard.stats.overall}`,
              inline: true,
            },
            { name: '🤝 Expires', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: false }
          );

        const acceptBtn = new ButtonBuilder().setCustomId(`trade_accept:${tradeId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success);
        const rejectBtn = new ButtonBuilder().setCustomId(`trade_reject:${tradeId}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder().addComponents(acceptBtn, rejectBtn);

        const msg = await interaction.editReply({ content: `${targetUser} — You have a trade offer!`, embeds: [embed], components: [row] });

        await Trade.findOneAndUpdate({ tradeId }, { messageId: msg.id });

        // Collector for response
        const collector = msg.createMessageComponentCollector({
          filter: (i) => ['trade_accept', 'trade_reject'].some((a) => i.customId.startsWith(a)) && i.user.id === targetUser.id,
          time: 86_400_000,
          max: 1,
        });

        collector.on('collect', async (i) => {
          await i.deferUpdate();
          const action = i.customId.split(':')[0];

          if (action === 'trade_accept') {
            // Execute the trade
            await Card.findOneAndUpdate({ cardId: myCard.cardId }, { $set: { ownerId: targetUser.id, obtainedFrom: 'trade' }, $push: { previousOwners: interaction.user.id }, $inc: { timesTraded: 1 } });
            await Card.findOneAndUpdate({ cardId: theirCard.cardId }, { $set: { ownerId: interaction.user.id, obtainedFrom: 'trade' }, $push: { previousOwners: targetUser.id }, $inc: { timesTraded: 1 } });

            if (coinsOffered > 0) {
              await User.findOneAndUpdate({ userId: interaction.user.id }, { $inc: { coins: -coinsOffered } });
              await User.findOneAndUpdate({ userId: targetUser.id }, { $inc: { coins: coinsOffered } });
            }

            await Trade.findOneAndUpdate({ tradeId }, { status: 'accepted', completedAt: new Date() });

            const successEmbed = EmbedFactory.success('Trade Completed! 🤝', `**${interaction.user.username}** and **${targetUser.username}** have successfully traded cards!`);
            await i.editReply({ embeds: [successEmbed], components: [] });
          } else {
            await Trade.findOneAndUpdate({ tradeId }, { status: 'rejected' });
            const rejectedEmbed = EmbedFactory.warning('Trade Declined', `**${targetUser.username}** declined the trade offer.`);
            await i.editReply({ embeds: [rejectedEmbed], components: [] });
          }
        });

        collector.on('end', async (_, reason) => {
          if (reason === 'time') {
            await Trade.findOneAndUpdate({ tradeId }, { status: 'expired' });
            msg.edit({ components: [] }).catch(() => {});
          }
        });
      }

      if (sub === 'pending') {
        const trades = await Trade.find({
          $or: [{ initiatorId: interaction.user.id }, { receiverId: interaction.user.id }],
          status: 'pending',
        }).limit(5).lean();

        if (!trades.length) {
          return interaction.reply({ embeds: [EmbedFactory.warning('No Trades', 'You have no pending trade offers.')], ephemeral: true });
        }

        const embed = EmbedFactory.base('🔄 **Pending Trades**')
          .setDescription(`*You have ${trades.length} pending trade(s)*\n`);

        for (const trade of trades) {
          const isInitiator = trade.initiatorId === interaction.user.id;
          embed.addFields({
            name: `Trade \`${trade.tradeId}\``,
            value: [
              isInitiator ? `📤 You offered → <@${trade.receiverId}>` : `📥 Offer from <@${trade.initiatorId}>`,
              `Cards: **${trade.offeredCards[0]?.playerName}** for **${trade.requestedCards[0]?.playerName}**`,
              `⏰ Expires: <t:${Math.floor(new Date(trade.expiresAt).getTime() / 1000)}:R>`,
            ].join('\n'),
            inline: false,
          });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
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
