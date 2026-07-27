'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { formatMatchStatus } = require('../../utils/formatters');
const { resolveMatchByName } = require('../../utils/matchLookup');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('livematch')
    .setDescription('🔴 Track a specific live match in detail')
    .addStringOption((opt) =>
      opt.setName('match')
        .setDescription('🔴 Match name, e.g. Arsenal vs Chelsea')
        .setRequired(true)
    ),

  cooldown: 15,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const matchQuery = interaction.options.getString('match');

      // Resolve the match name to a fixture ID once, then reuse for refreshes
      let matchId;
      try {
        const initial = await resolveMatchByName(api, matchQuery);
        matchId = initial.fixture?.id;
      } catch (err) {
        return interaction.editReply({
          embeds: [EmbedFactory.error('Match Not Found', err.message)],
        });
      }

      const buildMatchEmbed = async () => {
        const [fixtures, events] = await Promise.allSettled([
          api.getFixtureById(matchId),
          api.getFixtureEvents(matchId),
        ]);

        const fixture = fixtures.value?.[0];
        if (!fixture) return null;

        const homeName = fixture.teams?.home?.name || 'Home';
        const awayName = fixture.teams?.away?.name || 'Away';
        const hg       = fixture.goals?.home ?? 0;
        const ag       = fixture.goals?.away ?? 0;
        const status   = fixture.fixture?.status;
        const minute   = status?.elapsed ? `${status.elapsed}'` : formatMatchStatus(status?.short);
        const isLive   = ['1H', '2H', 'ET', 'HT', 'P'].includes(status?.short);

        const embed = (isLive ? EmbedFactory.live : EmbedFactory.base)
          .call(EmbedFactory, `**${homeName} ${hg} - ${ag} ${awayName}**`)
          .addFields(
            { name: '🔴 Competition', value: fixture.league?.name || 'N/A', inline: true },
            { name: '🔴 Status',      value: minute,                         inline: true },
            { name: '🔴 Venue',       value: fixture.fixture?.venue?.name || 'N/A', inline: true }
          );

        const evts = events.value;
        if (evts?.length) {
          const goalEvents = evts.filter((e) => e.type === 'Goal').slice(0, 10);
          const cardEvents = evts.filter((e) => e.type === 'Card').slice(0, 6);

          if (goalEvents.length) {
            const goalLines = goalEvents.map((e) => {
              const team  = e.team?.name === homeName ? '🏠' : '✈️';
              const extra = e.detail === 'Own Goal' ? ' (OG)' : e.detail === 'Penalty' ? ' (P)' : '';
              return `${team} ${e.time?.elapsed}' **${e.player?.name}**${extra}${e.assist?.name ? ` (${e.assist.name})` : ''}`;
            });
            embed.addFields({ name: '🔴 Goals', value: goalLines.join('\n'), inline: false });
          }

          if (cardEvents.length) {
            const cardLines = cardEvents.map((e) => {
              const cardEmoji = e.detail === 'Red Card' ? '🟥' : '🟨';
              return `${cardEmoji} ${e.time?.elapsed}' **${e.player?.name}** (${e.team?.name})`;
            });
            embed.addFields({ name: '🔴 Cards', value: cardLines.join('\n'), inline: false });
          }
        }

        embed.setFooter({ text: `⚽ Powered by GoalX · Updated ${new Date().toLocaleTimeString()}` });
        return embed;
      };

      const embed = await buildMatchEmbed();
      if (!embed) {
        return interaction.editReply({
          embeds: [EmbedFactory.error('Not Found', `Could not load match data for **"${matchQuery}"**.`)],
        });
      }

      const refreshBtn = new ButtonBuilder()
        .setCustomId('refresh:livematch')
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder().addComponents(refreshBtn);

      await interaction.editReply({ embeds: [embed], components: [row] });

      // Auto-refresh collector for 10 minutes
      const collector = interaction.channel?.createMessageComponentCollector({
        filter: (i) => i.customId === 'livematch_refresh' && i.user.id === interaction.user.id,
        time: 600_000,
      });

      collector?.on('collect', async (i) => {
        await i.deferUpdate();
        const refreshed = await buildMatchEmbed().catch(() => null);
        if (refreshed) await i.editReply({ embeds: [refreshed], components: [row] });
      });

      collector?.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });
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
