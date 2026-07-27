'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { DuelService } = require('../../services/duels/DuelService');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { requirePartner } = require('../../utils/partnerGuard');
const { resolveMatchByName } = require('../../utils/matchLookup');
const { formatCoins, fullTimestamp } = require('../../utils/format');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('duel')
    .setDescription('⚔️ Challenge another user to a prediction duel')
    .addUserOption((opt) =>
      opt.setName('opponent').setDescription('⚔️ Who to challenge').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('match')
        .setDescription('⚔️ Match name, e.g. Arsenal vs Chelsea')
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('stake').setDescription('⚔️ Coins to wager').setMinValue(1).setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('your_prediction')
        .setDescription('⚔️ Your score prediction, e.g. 2-1')
        .setRequired(true)
    ),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);

      const opponent   = interaction.options.getUser('opponent');
      const matchQuery = interaction.options.getString('match');
      const stake      = interaction.options.getInteger('stake');
      const prediction = interaction.options.getString('your_prediction');

      if (opponent.bot) {
        return interaction.editReply({
          embeds: [EmbedFactory.error('Invalid Opponent', 'You cannot duel a bot.')],
        });
      }

      try {
        const fixture  = await resolveMatchByName(api, matchQuery);
        const matchId  = String(fixture.fixture?.id);
        const homeTeam = fixture.teams?.home?.name;
        const awayTeam = fixture.teams?.away?.name;
        const matchDate = fixture.fixture?.date;

        const duel = await DuelService.createChallenge(
          interaction.guildId,
          interaction.user.id,
          opponent.id,
          { matchId, homeTeam, awayTeam, matchDate, stake, prediction }
        );

        const embed = EmbedFactory.compare(
          '⚔️ Duel Challenge Sent!',
          `${interaction.user} challenges ${opponent} to a prediction duel!`
        ).addFields(
          { name: '⚔️ Match',   value: `**${homeTeam}** vs **${awayTeam}**`, inline: true },
          { name: '⚔️ Kickoff', value: fullTimestamp(matchDate),              inline: true },
          { name: `${interaction.user.username}'s Pick`, value: `**${prediction}**`, inline: true },
          { name: '⚔️ Stake',   value: formatCoins(stake),                    inline: true },
        ).setFooter({ text: `${opponent.username} has 24h to accept | Duel ID: ${duel._id}` });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`duel_accept:${duel._id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`duel_decline:${duel._id}`).setLabel('Decline').setStyle(ButtonStyle.Danger),
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Duel Failed', err.message || 'Could not create duel.')],
        });
      }
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
};
