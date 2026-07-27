'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const Bet = require('../../models/Bet');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mybets')
    .setDescription('🎰 View your active and recent bets')
    .addStringOption((opt) =>
      opt.setName('status')
        .setDescription('🎰 Filter by status')
        .setRequired(false)
          .addChoices(
           { name: '🎰 Pending', value: 'pending' },
           { name: '🎰 Won', value: 'won' },
           { name: '🎰 Lost', value: 'lost' }
         )
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const status = interaction.options.getString('status') || 'pending';
      const bets = await Bet.find({ userId: interaction.user.id, status }).sort({ createdAt: -1 }).limit(10).lean();

      if (!bets.length) {
        return interaction.reply({
          embeds: [EmbedFactory.warning('No Bets', `You have no **${status}** bets.\n\nUse \`/bet\` to place a bet!`)],
          ephemeral: true,
        });
      }

      const statusEmoji = { pending: '⏳', won: '✅', lost: '❌', void: '🔵' };
      const embed = EmbedFactory.bet(`Your ${status.charAt(0).toUpperCase() + status.slice(1)} Bets`)
        .setDescription(`*Showing ${bets.length} ${status} bet(s)*\n`);

      for (const bet of bets) {
        const matchDate = `<t:${Math.floor(new Date(bet.matchDate).getTime() / 1000)}:D>`;
        embed.addFields({
          name: `${statusEmoji[bet.status]} **${bet.homeTeam}** vs **${bet.awayTeam}**`,
          value: [
            `**Type:** ${bet.betType.replace(/_/g, ' ')} · **Pick:** ${bet.prediction}`,
            `**Stake:** ${formatCoins(bet.amount)} · **Odds:** ${bet.odds}x · **Win:** ${formatCoins(bet.potentialWin)}`,
            `**Match:** ${matchDate}${bet.result ? ` · **Result:** ${bet.result}` : ''}`,
          ].join('\n'),
          inline: false,
        });
      }

      
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:mybets')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
await interaction.reply({ embeds: [embed], ephemeral: true ,
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
