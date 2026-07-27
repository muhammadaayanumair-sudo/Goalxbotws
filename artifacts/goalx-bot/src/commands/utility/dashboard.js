'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins, formatNumber, progressBar } = require('../../utils/formatters');
const User = require('../../models/User');
const Card = require('../../models/Card');
const MyTeam = require('../../models/MyTeam');
const { Stadium } = require('../../models/Stadium');
const { Contract } = require('../../models/Contract');
const { AchievementService } = require('../../services/AchievementService');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('📊 Your complete GoalX stats — economy, stadium, contracts, fantasy & more')
    .addUserOption((o) => o
      .setName('user')
      .setDescription('👤 View another user\'s dashboard')
      .setRequired(false)),

  cooldown: 10,

  async execute(interaction, client) {
    try {
      await interaction.deferReply();

      const target = interaction.options.getUser('user') || interaction.user;
      const userId = target.id;

      // Fetch everything in parallel
      const [user, team, stadium, activeContracts, cardCounts, achStatus] = await Promise.all([
        User.findOne({ userId }).lean(),
        MyTeam.findOne({ userId }).lean(),
        Stadium.findOne({ userId }).lean(),
        Contract.find({ userId, status: 'active' }).lean(),
        Card.aggregate([
          { $match: { ownerId: userId } },
          { $group: { _id: '$rarity', count: { $sum: 1 } } },
        ]),
        AchievementService.getStatus(userId),
      ]);

      if (!user) {
        return interaction.editReply({
          embeds: [EmbedFactory.warning('No Profile Found', `${target.username} hasn't used GoalX yet.`)],
        });
      }

      // ── XP & Level ─────────────────────────────────────────────────────────
      const xpNeeded = Math.floor(100 * Math.pow(1.5, user.level - 1));
      const bar      = progressBar(user.xp, xpNeeded, 14);

      // ── Cards ───────────────────────────────────────────────────────────────
      const byRarity = Object.fromEntries(cardCounts.map((c) => [c._id, c.count]));
      const rarityStr = ['legendary', 'epic', 'rare', 'common']
        .map((r) => byRarity[r] ? `${r === 'legendary' ? '🟡' : r === 'epic' ? '🟣' : r === 'rare' ? '🔵' : '⚪'} ${byRarity[r]}` : null)
        .filter(Boolean).join(' · ') || 'None';

      // ── Stadium ─────────────────────────────────────────────────────────────
      let stadiumStr = 'No stadium yet — use `/stadium view`';
      if (stadium) {
        const pending = (() => {
          const hrs = (Date.now() - new Date(stadium.lastCollected).getTime()) / 3_600_000;
          const { LEVELS } = require('../../models/Stadium');
          return Math.floor(Math.min(hrs, 24) * LEVELS[stadium.level - 1].revenuePerHour);
        })();
        stadiumStr = `**${stadium.name}** · Level ${stadium.level}/10\n💰 Pending: ${formatCoins(pending)}`;
      }

      // ── Contracts ───────────────────────────────────────────────────────────
      const validContracts = activeContracts.filter((c) => new Date() < new Date(c.endDate));
      let contractStr = 'No active contracts — use `/contract sign`';
      if (validContracts.length) {
        const netDaily = validContracts.reduce((s, c) => s + c.dailyRevenue - c.dailySalary, 0);
        contractStr = `**${validContracts.length}** active · ${formatCoins(netDaily)}/day net income`;
      }

      // ── Fantasy Team ─────────────────────────────────────────────────────────
      let teamStr = 'No team yet — use `/myteam add`';
      if (team) {
        const filled = team.players.length;
        teamStr = `**${team.teamName}** · ${filled}/11 players · ⭐ ${team.teamRating || '—'} rating`;
      }

      // ── Achievements ─────────────────────────────────────────────────────────
      const earned    = achStatus.filter((a) => a.earned).length;
      const total     = achStatus.length;
      const achBar    = progressBar(earned, total, 10);
      const recentAch = achStatus.filter((a) => a.earned).sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt)).slice(0, 3);
      const achStr    = recentAch.length
        ? recentAch.map((a) => `${a.emoji} ${a.name}`).join(' · ')
        : 'None yet';

      // ── Badges ──────────────────────────────────────────────────────────────
      const badges = [];
      if (user.isPartner) badges.push('🤝 Partner');
      if (user.premium)   badges.push('👑 Premium');
      if (user.level >= 25) badges.push('🏆 Legend');
      else if (user.level >= 10) badges.push('⭐ Pro');

      // ── Build embed ─────────────────────────────────────────────────────────
      const embed = EmbedFactory.base(`📊 **${target.username}'s Dashboard**`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .addFields(
          {
            name: '⭐ Level & Progress',
            value: [
              `**Level ${user.level}** ${badges.join(' ')}`,
              `XP: ${formatNumber(user.xp)} / ${formatNumber(xpNeeded)}`,
              `\`${bar}\` ${user.level}/∞`,
            ].join('\n'),
            inline: false,
          },
          {
            name: '💰 Economy',
            value: [
              `Wallet: ${formatCoins(user.coins)}`,
              `Bank: ${formatCoins(user.bank)}`,
              `Total Earned: ${formatCoins(user.totalEarned)}`,
              `Total Spent: ${formatCoins(user.totalSpent)}`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🎰 Betting',
            value: [
              `Record: **${user.betsWon}W / ${user.betsPlaced - user.betsWon}L**`,
              `Win Rate: **${user.betsPlaced > 0 ? ((user.betsWon / user.betsPlaced) * 100).toFixed(1) : 0}%**`,
              `Coins Won: ${formatCoins(user.betCoinsWon)}`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🃏 Cards',
            value: [`Collection: **${user.cardsOwned}** · Packs: ${user.packsOpened}`, rarityStr].join('\n'),
            inline: false,
          },
          {
            name: '🏟️ Stadium',
            value: stadiumStr,
            inline: true,
          },
          {
            name: '✍️ Contracts',
            value: contractStr,
            inline: true,
          },
          {
            name: '⚽ Fantasy Team',
            value: teamStr,
            inline: false,
          },
          {
            name: `🏅 Achievements (${earned}/${total})`,
            value: [`\`${achBar}\``, `Recent: ${achStr}`].join('\n'),
            inline: false,
          },
        )
        .setFooter({ text: `⚽ Powered by GoalX · Member since ${new Date(user.createdAt).toLocaleDateString()}` });

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:dashboard')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.editReply({ embeds: [embed] ,
        components: [refreshRow]});
    } catch (error) {
      logger.error('[dashboard] execute error:', error);
      const msg = { embeds: [EmbedFactory.error('Something went wrong', error.message || 'Unexpected error.')], flags: 64 };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
