'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { DuelService } = require('../../services/duels/DuelService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('accept')
    .setDescription('✅ Accept a pending duel challenge with your own prediction')
    .addStringOption((opt) => opt.setName('id').setDescription('✅ Duel ID (from the challenge message)').setRequired(true))
    .addStringOption((opt) => opt.setName('prediction').setDescription('✅ Your scoreline prediction, e.g. 2-1').setRequired(true)),

  cooldown: 5,

  async execute(interaction, client) {
    const duelId = interaction.options.getString('id').trim();
    const prediction = interaction.options.getString('prediction').trim();

    if (!/^\d{1,2}-\d{1,2}$/.test(prediction)) {
      return interaction.reply({
        embeds: [EmbedFactory.error('Invalid Prediction', 'Prediction must be a scoreline like `2-1` or `0-0`.')],
        ephemeral: true,
      });
    }

    try {
      const duel = await DuelService.acceptChallenge(duelId, interaction.user.id, prediction);

      const embed = EmbedFactory.bet(
        'Duel Accepted! ⚔️',
        `The duel is on! Winner is decided when **${duel.homeTeam} vs ${duel.awayTeam}** finishes.\n`
      );

      EmbedFactory.addFields(embed, [
        { name: '✅ Total Pot', value: formatCoins(duel.stake * 2), inline: true },
        { name: '✅ Your Prediction', value: `\`${duel.opponentPrediction}\``, inline: true },
        { name: '✅ Match Date', value: `<t:${Math.floor(new Date(duel.matchDate).getTime() / 1000)}:F>` },
      ]);

            const helpRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('help:accept')
          .setLabel('❓ Help')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed] ,
        components: [helpRow]});
    } catch (err) {
      await interaction.reply({
        embeds: [EmbedFactory.error('Could Not Accept', err.message || 'Failed to accept duel.')],
        ephemeral: true,
      });
    }
  },
};
