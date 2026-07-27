'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { DuelService } = require('../../services/duels/DuelService');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

const STATUS_EMOJI = { pending: '⏳', accepted: '⚔️' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('duels')
    .setDescription('⚔️ View your active prediction duels'),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      await interaction.deferReply({ ephemeral: true });

      const duels = await DuelService.getActiveDuels(interaction.user.id);

      if (!duels.length) {
        return interaction.editReply({
          embeds: [EmbedFactory.warning('No Active Duels', 'You have no pending or accepted duels.\n\nUse `/challenge` to start one!')],
        });
      }

      const otherIds = duels.map((d) => (d.challengerId === interaction.user.id ? d.opponentId : d.challengerId));
      const otherUsers = await User.find({ userId: { $in: otherIds } }).lean();
      const nameMap = new Map(otherUsers.map((u) => [u.userId, u.username]));

      const embed = EmbedFactory.bet('Your Active Duels', `*${duels.length} active duel(s)*\n`);

      for (const duel of duels) {
        const isChallenger = duel.challengerId === interaction.user.id;
        const otherId = isChallenger ? duel.opponentId : duel.challengerId;
        const otherName = nameMap.get(otherId) || 'Unknown';
        const myPrediction = isChallenger ? duel.challengerPrediction : duel.opponentPrediction;

        EmbedFactory.addFields(embed, [{
          name: `${STATUS_EMOJI[duel.status] || '❓'} ${duel.homeTeam} vs ${duel.awayTeam}`,
          value: [
            `**Opponent:** ${otherName}`,
            `**Status:** ${duel.status}`,
            `**Stake:** ${formatCoins(duel.stake)} each (pot: ${formatCoins(duel.stake * 2)})`,
            myPrediction ? `**Your Pick:** \`${myPrediction}\`` : '**Your Pick:** *not yet submitted*',
            `**Match:** <t:${Math.floor(new Date(duel.matchDate).getTime() / 1000)}:R>`,
            `**Duel ID:** \`${duel._id}\``,
          ].join('\n'),
        }]);
      }

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:duels')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.editReply({ embeds: [embed] ,
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
