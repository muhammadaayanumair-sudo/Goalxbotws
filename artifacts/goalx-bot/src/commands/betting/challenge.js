'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { DuelService } = require('../../services/duels/DuelService');
const { requirePartner } = require('../../utils/partnerGuard');
const { resolveMatchByName } = require('../../utils/matchLookup');
const Duel = require('../../models/Duel');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('⚔️ Challenge another user to a 1v1 score prediction duel')
    .addUserOption((opt) =>
      opt.setName('opponent').setDescription('⚔️ Who to challenge').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('match')
        .setDescription('⚔️ Match name, e.g. Arsenal vs Chelsea')
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('prediction')
        .setDescription('⚔️ Your scoreline prediction, e.g. 2-1')
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('stake')
        .setDescription('⚔️ Coins to stake (both sides match this amount)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10000)
    ),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);

      const opponent   = interaction.options.getUser('opponent');
      const matchQuery = interaction.options.getString('match');
      const prediction = interaction.options.getString('prediction').trim();
      const stake      = interaction.options.getInteger('stake');

      if (opponent.bot) {
        return interaction.editReply({
          embeds: [EmbedFactory.error('Invalid Opponent', 'You cannot challenge a bot.')],
        });
      }

      if (!/^\d{1,2}-\d{1,2}$/.test(prediction)) {
        return interaction.editReply({
          embeds: [EmbedFactory.error('Invalid Prediction', 'Prediction must be a scoreline like `2-1` or `0-0`.')],
        });
      }

      try {
        const fixture = await resolveMatchByName(api, matchQuery);
        const matchId = fixture.fixture?.id;

        const status = fixture.fixture?.status?.short;
        if (!['NS', 'TBD'].includes(status)) {
          return interaction.editReply({
            embeds: [EmbedFactory.error('Match Already Started', 'You can only challenge on upcoming matches that have not started.')],
          });
        }

        const homeTeam  = fixture.teams?.home?.name;
        const awayTeam  = fixture.teams?.away?.name;
        const matchDate = fixture.fixture?.date;

        const duel = await DuelService.createChallenge(interaction.guildId, interaction.user.id, opponent.id, {
          matchId, homeTeam, awayTeam, matchDate, stake, prediction,
        });

        const embed = EmbedFactory.bet(
          'Duel Challenge Sent! ⚔️',
          `**${interaction.user.username}** challenges **${opponent.username}** to a score prediction duel!\n`
        );

        EmbedFactory.addFields(embed, [
          { name: '⚔️ Match',                              value: `${homeTeam} vs ${awayTeam}`, inline: true },
          { name: '⚔️ Stake (each)',                      value: formatCoins(stake),            inline: true },
          { name: '⚔️ Winner Takes',                     value: formatCoins(stake * 2),         inline: true },
          { name: `🎯 ${interaction.user.username}'s Prediction`, value: `\`${prediction}\`` },
          { name: '⚔️ Expires', value: `<t:${Math.floor(duel.expiresAt.getTime() / 1000)}:R>` },
        ]);

        const acceptBtn  = new ButtonBuilder().setCustomId(`duel_accept_hint:${duel._id}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success);
        const declineBtn = new ButtonBuilder().setCustomId(`duel_decline:${duel._id}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder().addComponents(acceptBtn, declineBtn);

        const msg = await interaction.editReply({
          content: `${opponent} — you've been challenged! Use \`/accept id:${duel._id} prediction:<your score>\` or tap Decline below.`,
          embeds: [embed],
          components: [row],
        });

        const collector = msg.createMessageComponentCollector({
          filter: (i) =>
            ['duel_accept_hint', 'duel_decline'].some((a) => i.customId.startsWith(a)) &&
            i.user.id === opponent.id,
          time: 24 * 60 * 60 * 1000,
          max: 1,
        });

        collector.on('collect', async (i) => {
          const action = i.customId.split(':')[0];
          if (action === 'duel_accept_hint') {
            await i.reply({
              content: `To accept, run:\n\`/accept id:${duel._id} prediction:2-1\` (replace with your actual score prediction)`,
              ephemeral: true,
            });
          } else {
            await i.deferUpdate();
            try {
              await DuelService.declineChallenge(duel._id, opponent.id);
              await i.editReply({
                embeds: [EmbedFactory.warning('Duel Declined', `**${opponent.username}** declined the challenge. ${interaction.user.username}'s stake has been refunded.`)],
                components: [],
              });
            } catch (err) {
              await i.followUp({ content: `❌ ${err.message}`, ephemeral: true });
            }
          }
        });

        collector.on('end', async (_collected, reason) => {
          if (reason === 'time') {
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
          embeds: [EmbedFactory.error('Challenge Failed', err.message || 'Could not create challenge.')],
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
