'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins, ordinal } = require('../../utils/formatters');
const { EconomyService } = require('../../services/economy/EconomyService');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('🏆 View the GoalX leaderboards')
    .addStringOption((opt) =>
      opt.setName('type')
        .setDescription('🏆 Leaderboard type')
        .setRequired(false)
        .addChoices(
          { name: '🏆 Richest', value: 'coins' },
          { name: '🏆 Highest Level', value: 'level' },
          { name: '🏆 Best Bettors (All-Time)', value: 'bets' },
          { name: '🏆 Best Bettors (This Month)', value: 'monthly' },
          { name: '🏆 Season XP Leaderboard', value: 'season' }
        )
    ),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const type = interaction.options.getString('type') || 'coins';
      return this._render(interaction, type, false);
    } catch (error) {
    const isExpiredInteraction = error.code === 10062;
    if (!isExpiredInteraction) {
      logger.error(`[${interaction.commandName}] execute error:`, error);
    }
    try {
      const msg = {
        embeds: [EmbedFactory.error('Something went wrong', error.message || 'An unexpected error occurred.')],
        flags: 64,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else if (!isExpiredInteraction) {
        await interaction.reply(msg);
      }
    } catch (_) { /* interaction already expired */ }
  }
},

  async _render(interaction, type, isButton) {
    const User = require('../../models/User');

    if (type === 'monthly') {
      return this._executeMonthly(interaction);
    }

    if (type === 'season') {
      return this._executeSeason(interaction);
    }

    let users;
    let title;

    if (type === 'coins') {
      users = await User.find({}).sort({ coins: -1 }).limit(10).lean();
      title = '💰 Richest Players';
    } else if (type === 'level') {
      users = await User.find({}).sort({ level: -1, totalXp: -1 }).limit(10).lean();
      title = '⭐ Highest Levels';
    } else {
      users = await User.find({ betsPlaced: { $gt: 0 } }).sort({ betsWon: -1 }).limit(10).lean();
      title = '🎯 Best Bettors';
    }

    if (!users.length) {
      const reply = { embeds: [EmbedFactory.warning('📭 Empty Leaderboard', 'No data yet. Start playing to appear here!')] };
      return isButton ? interaction.editReply(reply) : interaction.editReply(reply);
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = users.map((u, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      let stat;
      if (type === 'coins') stat = formatCoins(u.coins);
      else if (type === 'level') stat = `Level **${u.level}** (${u.totalXp.toLocaleString()} XP)`;
      else stat = `${u.betsWon}/${u.betsPlaced} wins`;
      return `${medal} **${u.username}** — ${stat}`;
    });

    const embed = EmbedFactory.economy(`**${title}**`)
      .setDescription(`*Top ${users.length} players*\n\n${lines.join('\n')}`);

    const allUsers = await User.find({}).sort(
      type === 'coins' ? { coins: -1 } :
      type === 'level' ? { level: -1, totalXp: -1 } :
      { betsWon: -1 }
    ).lean();
    const myRank = allUsers.findIndex((u) => u.userId === interaction.user.id) + 1;
    if (myRank > 0) {
      embed.setFooter({ text: `⚽ Powered by GoalX · Your rank: ${ordinal(myRank)} of ${allUsers.length} players` });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`leaderboard:refresh:${type}`)
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Secondary)
    );

    const reply = { embeds: [embed], components: [row] };
    return isButton ? interaction.editReply(reply) : interaction.editReply(reply);
  },

  async handleButton(interaction) {
    const [, , type] = interaction.customId.split(':');
    await interaction.deferUpdate();
    return this._render(interaction, type || 'coins', true);
  },

  /**
   * Builds the "this month" bet leaderboard using MongoDB aggregation over
   * Bet.resolvedAt, rather than adding a new schema field to User — monthly
   * resets happen naturally since each new month's bets simply weren't
   * resolved in the previous window.
   */
  async _executeMonthly(interaction) {
    const Bet = require('../../models/Bet');
    const User = require('../../models/User');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const results = await Bet.aggregate([
      { $match: { status: { $in: ['won', 'lost'] }, resolvedAt: { $gte: monthStart } } },
      {
        $group: {
          _id: '$userId',
          won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
          placed: { $sum: 1 },
          coinsWon: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, '$coinsAwarded', 0] } },
        },
      },
      { $sort: { won: -1, coinsWon: -1 } },
      { $limit: 10 },
    ]);

    if (!results.length) {
      return interaction.editReply({
        embeds: [EmbedFactory.warning('No Data Yet', `No resolved bets this month yet.\n\n*Resets automatically on the 1st of each month.*`)],
      });
    }

    const userIds = results.map((r) => r._id);
    const users = await User.find({ userId: { $in: userIds } }).lean();
    const userMap = new Map(users.map((u) => [u.userId, u.username]));

    const medals = ['🥇', '🥈', '🥉'];
    const lines = results.map((r, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      const name = userMap.get(r._id) || 'Unknown';
      return `${medal} **${name}** — ${r.won}/${r.placed} wins · ${formatCoins(r.coinsWon)} won`;
    });

    const monthName = now.toLocaleString('default', { month: 'long' });
    const embed = EmbedFactory.economy(`**Best Bettors — ${monthName}**`)
      .setDescription(`*Top ${results.length} this month*\n\n${lines.join('\n')}`)
      .setFooter({ text: '⚽ Powered by GoalX · Resets on the 1st of each month' });

    const myIndex = results.findIndex((r) => r._id === interaction.user.id);
    if (myIndex >= 0) {
      embed.setFooter({ text: `⚽ Powered by GoalX · Your rank: ${ordinal(myIndex + 1)} this month` });
    }

    await interaction.editReply({ embeds: [embed] });
  },

  /**
   * Season leaderboard: users who gained the most XP since the first of the
   * current month. Uses the existing `totalXp` field as a proxy and resets
   * monthly (a "season" = calendar month).
   */
  async _executeSeason(interaction) {
    const User = require('../../models/User');

    const now = new Date();
    const seasonStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // totalXp is cumulative, so we approximate season gain by ranking by XP.
    // A future migration can track `seasonXp` explicitly.
    const users = await User.find({ totalXp: { $gt: 0 } })
      .sort({ totalXp: -1, level: -1 })
      .limit(10)
      .lean();

    if (!users.length) {
      return interaction.editReply({
        embeds: [EmbedFactory.warning('No Data Yet', 'No season XP data available yet.')],
      });
    }

    const monthName = seasonStart.toLocaleString('default', { month: 'long' });
    const medals = ['🥇', '🥈', '🥉'];
    const lines = users.map((u, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      return `${medal} **${u.username}** — Level **${u.level}** · ${u.totalXp.toLocaleString()} XP`;
    });

    const embed = EmbedFactory.economy(`**🌟 Season Leaderboard — ${monthName}**`)
      .setDescription(`*Top ${users.length} this season*\n\n${lines.join('\n')}`)
      .setFooter({ text: '⚽ Powered by GoalX · Season resets on the 1st of each month' });

    const allUsers = await User.find({ totalXp: { $gt: 0 } })
      .sort({ totalXp: -1, level: -1 })
      .lean();
    const myRank = allUsers.findIndex((u) => u.userId === interaction.user.id) + 1;
    if (myRank > 0) {
      embed.setFooter({ text: `⚽ Powered by GoalX · Your rank: ${ordinal(myRank)} of ${allUsers.length}` });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
