'use strict';

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { logger } = require('../../utils/logger');

const CATEGORIES = {
  '⚽ Football': {
    emoji: '⚽',
    description: 'Live scores, fixtures, standings and more',
    commands: [
      '`/live` - Live match scores',
      '`/fixtures` - Today\'s upcoming matches',
      '`/standings` - League table',
      '`/team` - Team profile & stats',
      '`/player` - Player profile & stats',
      '`/topscorers` - Top scorers',
      '`/injuries` - Injury report',
      '`/predictions` - AI match prediction',
      '`/stadium` - Stadium info',
      '`/compareteam` - Compare two teams',
      '`/compareplayer` - Compare two players',
    ],
  },
  '📰 News': {
    emoji: '📰',
    description: 'Latest football news and updates',
    commands: [
      '`/news` - Latest football news',
      '`/transfernews` - Transfer rumours',
    ],
  },
  '🤖 AI': {
    emoji: '🤖',
    description: 'Groq ⚡ AI-powered football analysis',
    commands: [
      '`/ask` - Ask GoalX AI anything',
      '`/analyze` - AI team/player analysis',
      '`/predictions` - AI match predictions',
      '`/explain` - Explain football concepts',
      '`/recap` - AI writes a match recap',
      '`/bio` - AI writes a player biography',
      '`/chants` - AI writes fun fan chants',
      '`/models` - View available Groq AI models',
      '`/clearhistory` - Reset your AI conversation',
    ],
  },
  '🎰 Betting': {
    emoji: '🎰',
    description: 'Virtual betting with GoalCoins',
    commands: [
      '`/bet` - Place a virtual bet',
      '`/mybets` - View your active bets',
      '`/bethistory` - Betting history',
      '`/streak` - View your win/loss streak',
      '`/accuracy` - Accuracy breakdown by bet type',
      '`/challenge` - Challenge a user to a prediction duel',
      '`/accept` - Accept a pending duel',
      '`/duels` - View your active duels',
    ],
  },
  '💰 Economy': {
    emoji: '💰',
    description: 'Earn and spend GoalCoins',
    commands: [
      '`/balance` - Check your wallet',
      '`/daily` - Claim daily reward',
      '`/weekly` - Claim weekly reward',
      '`/work` - Earn coins by working',
      '`/pay` - Transfer coins to a user',
      '`/rank` - Your level & XP rank',
      '`/leaderboard` - Top players',
    ],
  },
  '🃏 Cards': {
    emoji: '🃏',
    description: 'Football card collection game',
    commands: [
      '`/openpack` - Open a card pack',
      '`/cards` - View your collection',
      '`/card` - View a specific card',
      '`/sell` - Sell a card for coins',
      '`/trade` - Trade cards with players',
      '`/market` - Card marketplace',
      '`/auction` - Bid on cards',
      '`/cardlock` - Lock/unlock a card',
    ],
  },
  '👥 My Team': {
    emoji: '👥',
    description: 'Build your own 11-player squad from your cards',
    commands: [
      '`/myteam view` - View your current lineup',
      '`/myteam add` - Add a card to a slot (0-10)',
      '`/myteam remove` - Remove a player from your team',
      '`/myteam best` - Auto-select your best 11 players',
      '`/myteam formation` - Change formation (4-3-3, 4-4-2, etc)',
      '`/myteam rename` - Rename your team',
      '`/myteam clear` - Clear all players',
    ],
  },
  '⚙️ Settings': {
    emoji: '⚙️',
    description: 'Server configuration commands',
    commands: [
      '`/feature-configuration fixtures` - Daily fixture announcements',
      '`/feature-configuration live` - Live scores channel',
      '`/feature-configuration goals` - Goal alerts channel',
      '`/feature-configuration news` - Football news channel',
      '`/feature-configuration transfers` - Transfer news channel',
      '`/feature-configuration logs` - Bot log channel',
      '`/feature-configuration fabrizio-romano-posts` - Fabrizio Romano posts',
      '`/feature-configuration intro-dm` - Welcome DM on join',
      '`/settings` - Server settings',
      '`/status` - Check which features are configured',
    ],
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('❓ View all GoalX commands'),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      // Main help embed — always shows every category
      const embed = EmbedFactory.base('⚽ **GoalX — Command Help**')
        .setThumbnail(client.user.displayAvatarURL())
        .setDescription(
          'GoalX is your all-in-one Discord football companion!\n\n' +
          'Select a category below to view its commands.'
        );

      for (const [name, cat] of Object.entries(CATEGORIES)) {
        embed.addFields({
          name,
          value: cat.description + `\n*(${cat.commands.length} commands)*`,
          inline: true,
        });
      }

      embed.addFields({
        name: '🔗 Links',
        value: '[Invite Bot](https://discord.com/oauth2/authorize?client_id=1517258426898448394&permissions=8&scope=bot+applications.commands) · [Support Server](https://discord.gg/RVFtDPENpW) · [Documentation](https://docs.google.com/document/d/1PkQ0wu7bAa-dEyAGYTRh3_jQRyZjT5bfNecTvmpnFPI/edit?usp=sharing) · [Top.gg](https://top.gg)',
        inline: false,
      });

      // Category select menu
      const select = new StringSelectMenuBuilder()
        .setCustomId('help_category')
        .setPlaceholder('Select a category to explore...')
        .addOptions(
          Object.entries(CATEGORIES).map(([name, cat]) => ({
            label: name,
            description: cat.description,
            value: name.toLowerCase().replace(/[^a-z]/g, ''),
            emoji: cat.emoji,
          }))
        );

      const row = new ActionRowBuilder().addComponents(select);

      const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

      const collector = msg.createMessageComponentCollector({
        filter: (i) => i.customId === 'help_category' && i.user.id === interaction.user.id,
        time: 60_000,
      });

      collector.on('collect', async (i) => {
        await i.deferUpdate();
        const selected = i.values[0];
        const cat = Object.entries(CATEGORIES).find(([n]) =>
          n.toLowerCase().replace(/[^a-z]/g, '') === selected
        );
        if (!cat) return;

        const [catName, catData] = cat;
        const catEmbed = EmbedFactory.base(`**${catData.emoji} ${catName}**`)
          .setDescription(catData.commands.join('\n'))
          .setFooter({ text: 'GoalX • Select another category below' });

        await i.editReply({ embeds: [catEmbed], components: [row] });
      });

      collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });
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
