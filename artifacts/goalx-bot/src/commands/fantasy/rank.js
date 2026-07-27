'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatNumber, ordinal, progressBar } = require('../../utils/formatters');
const MyTeam = require('../../models/MyTeam');
const { logger } = require('../../utils/logger');

const MEDALS = ['🥇', '🥈', '🥉'];
const RARITY_STARS = { legendary: '🟡', epic: '🟣', rare: '🔵', common: '⚪' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fantasyrank')
    .setDescription('🏅 Fantasy team leaderboard — see who has the highest-rated squad')
    .addStringOption((o) => o
      .setName('type')
      .setDescription('🏅 What to rank by')
      .setRequired(false)
      .addChoices(
        { name: '🏅 Team Rating (default)', value: 'rating' },
        { name: '🏅 Most Complete Teams (11 players)', value: 'complete' },
      )),

  cooldown: 10,

  async execute(interaction, client) {
    try {
      await interaction.deferReply();
      const type = interaction.options.getString('type') || 'rating';

      let teams, title;
      if (type === 'rating') {
        teams = await MyTeam.find({ teamRating: { $gt: 0 } })
          .sort({ teamRating: -1 })
          .limit(10)
          .lean();
        title = '⭐ Top Fantasy Teams by Rating';
      } else {
        teams = await MyTeam.find({})
          .sort({ 'players.10': { $exists: true }, teamRating: -1 })
          .limit(10)
          .lean();
        // Sort: complete (11 players) first, then by rating
        teams.sort((a, b) => {
          if (b.players.length !== a.players.length) return b.players.length - a.players.length;
          return (b.teamRating || 0) - (a.teamRating || 0);
        });
        title = '👥 Most Complete Fantasy Teams';
      }

      if (!teams.length) {
        return interaction.editReply({
          embeds: [EmbedFactory.warning('No Teams Yet', 'No fantasy teams have been built yet!\n\nCreate yours with `/myteam add`.')],
        });
      }

      // We need to get usernames — store them in MyTeam or look up from User
      const User = require('../../models/User');
      const userIds = teams.map((t) => t.userId);
      const users   = await User.find({ userId: { $in: userIds } }).lean();
      const userMap = new Map(users.map((u) => [u.userId, u.username]));

      const lines = teams.map((t, i) => {
        const medal    = MEDALS[i] || `**${i + 1}.**`;
        const name     = userMap.get(t.userId) || 'Unknown';
        const filled   = t.players.length;
        const complete = filled === 11 ? ' ✅' : ` (${filled}/11)`;
        const rating   = t.teamRating ? `⭐ **${t.teamRating}**` : '⭐ —';

        return `${medal} **${t.teamName}** — ${name}${complete}\n   ${rating} · Formation: ${t.formation}`;
      });

      // Find requesting user's rank
      const total       = await MyTeam.countDocuments({ teamRating: { $gt: 0 } });
      const myTeam      = await MyTeam.findOne({ userId: interaction.user.id }).lean();
      let myRankLine    = '';
      if (myTeam?.teamRating > 0) {
        const above    = await MyTeam.countDocuments({ teamRating: { $gt: myTeam.teamRating } });
        const myRank   = above + 1;
        myRankLine     = `\nYour rank: **${ordinal(myRank)}** of ${total} teams · Rating: ⭐ ${myTeam.teamRating}`;
      }

      const embed = EmbedFactory.base(`**${title}**`)
        .setDescription(`*Top ${teams.length} fantasy squads*\n\n${lines.join('\n\n')}`)
        .setFooter({ text: `⚽ Powered by GoalX · Build your squad with /myteam${myRankLine}` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('refresh:fantasyrank').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
      );
      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      logger.error('[fantasyrank] execute error:', error);
      const msg = { embeds: [EmbedFactory.error('Something went wrong', error.message || 'Unexpected error.')], flags: 64 };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
