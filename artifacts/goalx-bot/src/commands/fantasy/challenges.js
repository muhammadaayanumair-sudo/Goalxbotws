'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const User = require('../../models/User');
const { requirePartner } = require('../../utils/partnerGuard');
const { logger } = require('../../utils/logger');

// Daily / Weekly challenges pool
const CHALLENGES = [
  { id: 'bet_winner', name: 'Punter', description: 'Win a match winner bet', reward: 300, type: 'daily', xp: 50 },
  { id: 'open_pack', name: 'Card Collector', description: 'Open any card pack', reward: 150, type: 'daily', xp: 30 },
  { id: 'check_live', name: 'Match Watcher', description: 'Use /live command', reward: 100, type: 'daily', xp: 20 },
  { id: 'check_standings', name: 'Table Checker', description: 'Use /standings command', reward: 100, type: 'daily', xp: 20 },
  { id: 'level_up', name: 'Rising Star', description: 'Gain 100 XP today', reward: 250, type: 'daily', xp: 40 },
  { id: 'win_3_bets', name: 'Hot Streak', description: 'Win 3 bets this week', reward: 1000, type: 'weekly', xp: 200 },
  { id: 'open_5_packs', name: 'Pack Addict', description: 'Open 5 packs this week', reward: 800, type: 'weekly', xp: 150 },
  { id: 'earn_2000', name: 'Coin Grinder', description: 'Earn 2,000 coins this week', reward: 500, type: 'weekly', xp: 100 },
  { id: 'trade_card', name: 'Trader', description: 'Complete a card trade', reward: 600, type: 'weekly', xp: 120 },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('challenges')
    .setDescription('🎯 View your daily and weekly challenges'),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      const user = await User.findOne({ userId: interaction.user.id }).lean();

      // Show 3 daily + 2 weekly challenges (seeded by date for consistency)
      const todayStr = new Date().toDateString();
      const seed = todayStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

      const daily = CHALLENGES
        .filter((c) => c.type === 'daily')
        .slice(seed % 3, (seed % 3) + 3);

      const weekly = CHALLENGES
        .filter((c) => c.type === 'weekly')
        .slice(seed % 2, (seed % 2) + 2);

      const embed = EmbedFactory.base('🎯 **Daily & Weekly Challenges**')
        .setDescription('🎯 *Complete challenges to earn bonus GoalCoins and XP — resets daily/weekly*\n')
        .addFields(
          {
            name: '📅 Daily Challenges',
            value: daily.map((c) => `• **${c.name}** — ${c.description}\n  Reward: ${formatCoins(c.reward)} + ${c.xp} XP`).join('\n'),
            inline: false,
          },
          {
            name: '📆 Weekly Challenges',
            value: weekly.map((c) => `• **${c.name}** — ${c.description}\n  Reward: ${formatCoins(c.reward)} + ${c.xp} XP`).join('\n'),
            inline: false,
          }
        )
        .setFooter({ text: '⚽ Powered by GoalX · Rewards claimed automatically on completion' });

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:challenges')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.reply({ embeds: [embed] ,
        components: [refreshRow]});
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
