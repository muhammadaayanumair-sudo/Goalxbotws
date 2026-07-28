'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('ℹ️ About GoalX — the ultimate football Discord bot'),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      const embed = EmbedFactory.base('⚽ About GoalX')
        .setThumbnail(client.user.displayAvatarURL())
        .setDescription(
          '**GoalX** is the most advanced football Discord bot, bringing the beautiful game directly to your server.\n\n' +
          'Built with ❤️ for football fans around the world.'
        )
        .addFields(
          {
            name: '🌟 Features',
            value: [
              '🔴 **Live Scores** — Real-time match updates every 60 seconds',
              '📅 **Fixtures & Results** — Today\'s schedule and latest results',
              '📊 **Standings** — League tables from 100+ competitions',
              '⚽ **Player & Team Stats** — Deep statistics and profiles',
              '📰 **News & Transfers** — Aggregated from top football sources',
              '🤖 **AI Analysis** — Groq-powered predictions and insights (ultra-fast ⚡)',
              '🃏 **Card Collection** — Open packs, trade, and auction',
              '🎰 **Virtual Betting** — Bet GoalCoins with real odds',
              '💰 **Economy System** — Earn, spend, and compete',
            ].join('\n'),
            inline: false,
          },
          {
            name: '🔗 Links',
            value: [
              '[🤖 Add to Server](https://discord.com/oauth2/authorize?client_id=1517258426898448394&permissions=8&scope=bot+applications.commands)',
              '[💬 Support Server](https://discord.gg/FX3yCJ3rwx)',
              '[⭐ Vote on Top.gg](https://top.gg/bot/goalx)',
              '[📖 Documentation](https://docs.google.com/document/d/1PkQ0wu7bAa-dEyAGYTRh3_jQRyZjT5bfNecTvmpnFPI/edit?usp=sharing)',
              '[🔒 Privacy Policy](https://docs.google.com/document/d/14ZfCc_Qr68_TQHEB1bdJ1gUFWnWasM9yIqGVoU3gS3U/edit?usp=sharing)',
              '[📜 Terms of Service](https://docs.google.com/document/d/1gvzwhWBs_hpieEQv_vTc2HS0hxMW_UmbOzoOwZhYRCQ/edit?usp=sharing)',
            ].join(' · '),
            inline: false,
          }
        )
        .setFooter({ text: 'GoalX v1.0.0 • Discord.js v14 • Powered by Goalx ⚡' });

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:about')
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
