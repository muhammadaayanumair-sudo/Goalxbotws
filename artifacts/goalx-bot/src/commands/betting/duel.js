'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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

        const msg = await interaction.editReply({ embeds: [embed], components: [row] });

        const collector = msg.createMessageComponentCollector({
          filter: (i) =>
            ['duel_accept', 'duel_decline'].some((a) => i.customId.startsWith(a)) &&
            i.user.id === opponent.id,
          time: 24 * 60 * 60 * 1000,
        });

        collector.on('collect', async (i) => {
          const action = i.customId.split(':')[0];

          if (action === 'duel_accept') {
            const modal = new ModalBuilder()
              .setCustomId(`duel_accept_modal:${duel._id}`)
              .setTitle('Accept Duel — Your Prediction');

            const predictionInput = new TextInputBuilder()
              .setCustomId('prediction')
              .setLabel('Your scoreline prediction (e.g. 2-1)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('2-1')
              .setMinLength(3)
              .setMaxLength(5)
              .setRequired(true);

            await i.showModal(modal.addComponents(new ActionRowBuilder().addComponents(predictionInput)));

            let modalSubmit;
            try {
              modalSubmit = await i.awaitModalSubmit({
                filter: (m) => m.customId === `duel_accept_modal:${duel._id}` && m.user.id === opponent.id,
                time: 5 * 60 * 1000,
              });
            } catch {
              return; // modal timed out — button still there, they can tap Accept again
            }

            const acceptPrediction = modalSubmit.fields.getTextInputValue('prediction').trim();
            if (!/^\d{1,2}-\d{1,2}$/.test(acceptPrediction)) {
              await modalSubmit.reply({
                content: '❌ Prediction must be a scoreline like `2-1` or `0-0`. Tap **Accept** again to retry.',
                ephemeral: true,
              });
              return;
            }

            try {
              await modalSubmit.deferUpdate();
              const accepted = await DuelService.acceptChallenge(duel._id, opponent.id, acceptPrediction);

              const acceptedEmbed = EmbedFactory.compare(
                '⚔️ Duel Accepted!',
                `The duel is on! Winner is decided when **${accepted.homeTeam}** vs **${accepted.awayTeam}** finishes.`
              ).addFields(
                { name: '⚔️ Total Pot', value: formatCoins(accepted.stake * 2), inline: true },
                { name: `🎯 ${interaction.user.username}'s Pick`, value: `**${accepted.challengerPrediction}**`, inline: true },
                { name: `🎯 ${opponent.username}'s Pick`, value: `**${accepted.opponentPrediction}**`, inline: true },
              );

              await interaction.editReply({ embeds: [acceptedEmbed], components: [] });
              collector.stop('resolved');
            } catch (err) {
              await modalSubmit.followUp({ content: `❌ ${err.message}`, ephemeral: true }).catch(() => {});
            }
          } else {
            await i.deferUpdate();
            try {
              await DuelService.declineChallenge(duel._id, opponent.id);
              await i.editReply({
                embeds: [EmbedFactory.error('Duel Declined', `**${opponent.username}** declined the challenge. ${interaction.user.username}'s stake has been refunded.`)],
                components: [],
              });
              collector.stop('resolved');
            } catch (err) {
              await i.followUp({ content: `❌ ${err.message}`, ephemeral: true });
            }
          }
        });

        collector.on('end', async (_collected, reason) => {
          if (reason === 'time') {
            const Duel = require('../../models/Duel');
            const User = require('../../models/User');
            const stillPending = await Duel.findById(duel._id);
            if (stillPending?.status === 'pending') {
              stillPending.status = 'expired';
              await stillPending.save();
              await User.findOneAndUpdate({ userId: interaction.user.id }, { $inc: { coins: stake } });
              await interaction.editReply({ components: [] }).catch(() => {});
            }
          }
        });
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