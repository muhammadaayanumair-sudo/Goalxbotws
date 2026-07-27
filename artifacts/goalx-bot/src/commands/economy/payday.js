'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { requirePartner } = require('../../utils/partnerGuard');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

const PAYDAY_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours
const PAYDAY_MIN = 500;
const PAYDAY_MAX = 1200;

const PARTNER_JOBS = [
  'signed a multi-million sponsorship deal',
  'negotiated a player transfer fee',
  'gave a punditry segment on Sky Sports',
  'consulted for a top-flight club\'s analytics team',
  'wrote a tactical column for The Athletic',
  'presented the Player of the Month award',
  'hosted a football podcast with 50K listeners',
  'scouted a wonderkid who just got signed',
  'managed a pre-season tour for a Premier League club',
  'provided half-time analysis for a Champions League game',
  'advised a club on stadium expansion plans',
  'led a football academy masterclass session',
];

/**
 * /payday — Partner-exclusive high-paying job.
 * Earns 500–1200 coins with a 2-hour cooldown.
 * Partners only.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('payday')
    .setDescription('💰 [Partner] Take on a high-paying football role (500–1,200 coins, 2h cooldown)'),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;

      const user = await User.findOne({ userId: interaction.user.id });
      if (!user) {
        return interaction.reply({
          embeds: [EmbedFactory.error('Not Found', 'Use any other command first to create your profile.')],
          ephemeral: true,
        });
      }

      const now = Date.now();
      if (user.lastPayday && now - user.lastPayday.getTime() < PAYDAY_COOLDOWN) {
        const remaining = PAYDAY_COOLDOWN - (now - user.lastPayday.getTime());
        const hours   = Math.floor(remaining / 3_600_000);
        const minutes = Math.floor((remaining % 3_600_000) / 60_000);
        return interaction.reply({
          embeds: [EmbedFactory.warning('On Break', `You\'re off duty. Next payday available in **${hours}h ${minutes}m**.`)],
          ephemeral: true,
        });
      }

      const coins = Math.floor(Math.random() * (PAYDAY_MAX - PAYDAY_MIN + 1)) + PAYDAY_MIN;
      const job = PARTNER_JOBS[Math.floor(Math.random() * PARTNER_JOBS.length)];

      user.addCoins(coins);
      user.lastPayday = new Date();
      const { leveledUp, newLevel } = user.addXp(40);
      await user.save();

      const embed = EmbedFactory.economy('💼 Payday!')
        .setDescription(
          `You **${job}** and earned **${formatCoins(coins)}**!\n\n` +
          (leveledUp ? `🎊 **Level Up!** You are now **Level ${newLevel}**!\n\n` : '') +
          `*Next payday available in 2 hours.*`
        )
        .addFields({ name: '💰 Partner Perk', value: `${PAYDAY_MIN.toLocaleString()}–${PAYDAY_MAX.toLocaleString()} coins per shift · 4× normal work pay`, inline: false })
        .setFooter({ text: '⚽ Powered by GoalX · Partner Exclusive' });

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:payday')
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
