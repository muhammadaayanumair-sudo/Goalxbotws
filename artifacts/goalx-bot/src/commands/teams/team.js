'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('⚽ View detailed team information — no ID needed')
    .addStringOption((opt) =>
      opt.setName('name').setDescription('⚽ Team name (e.g. Arsenal, Barcelona)').setRequired(true)
    ),

  cooldown: 10,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const teamName = interaction.options.getString('name');

      try {
        const teams = await api.searchTeam(teamName);
        if (!teams?.length) {
          return interaction.editReply({ embeds: [EmbedFactory.error('Team Not Found', `No team found matching: \`${teamName}\``)] });
        }

        const teamData = teams[0];
        const team  = teamData.team;
        const venue = teamData.venue;

        const [squad, recentFixtures] = await Promise.allSettled([
          api.getTeamSquad(team.id),
          api.getFixturesByTeam(team.id, 6),
        ]);

        const squadList = squad.status === 'fulfilled' ? squad.value?.[0]?.players || [] : [];
        const fixtures  = recentFixtures.status === 'fulfilled' ? recentFixtures.value || [] : [];

        const completed = fixtures.filter((f) => ['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short));
        const form = completed.slice(0, 5).map((f) => {
          const isHome = f.teams?.home?.id === team.id;
          const myGoals = isHome ? f.goals?.home : f.goals?.away;
          const oppGoals = isHome ? f.goals?.away : f.goals?.home;
          if (myGoals > oppGoals) return '🟢';
          if (myGoals === oppGoals) return '🟡';
          return '🔴';
        });

        const upcoming = fixtures.find((f) => f.fixture?.status?.short === 'NS');

        const embed = EmbedFactory.profile(
          `🏟️ **${team.name}**`,
          `*${team.country || 'N/A'} · Founded ${team.founded || 'N/A'}*\n`
        ).setThumbnail(team.logo || null);

        EmbedFactory.addFields(embed, [
          {
            name: '🏟️ Venue',
            value: venue
              ? `**${venue.name || 'N/A'}**\n📍 ${venue.city || 'N/A'} · 👥 ${venue.capacity?.toLocaleString() || 'N/A'} capacity`
              : 'No venue data available',
          },
          { name: '⚽ Squad', value: `**${squadList.length}** registered players`, inline: true },
        ]);

        if (form.length > 0) {
          embed.addFields({
            name: '📈 Recent Form',
            value: `${form.join(' ')} *(last ${form.length})*`,
            inline: true,
          });
        }

        if (upcoming) {
          const oppTeam = upcoming.teams?.home?.id === team.id
            ? upcoming.teams?.away?.name
            : upcoming.teams?.home?.name;
          const kickoff = upcoming.fixture?.date
            ? `<t:${Math.floor(new Date(upcoming.fixture.date).getTime() / 1000)}:R>`
            : 'TBD';
          embed.addFields({
            name: '⏱️ Next Match',
            value: `**vs ${oppTeam}** — ${kickoff}\n🏆 *${upcoming.league?.name}*`,
            inline: false,
          });
        }

        if (squadList.length > 0) {
          const topPlayers = squadList.slice(0, 6).map((p) => `• **${p.name}** — ${p.position}`).join('\n');
          embed.addFields({ name: '⚽ Key Players', value: topPlayers, inline: false });
        }

        // Quick action buttons
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`team_squad:${team.id}`).setLabel('👥 Full Squad').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`team_form:${team.id}:${team.name}`).setLabel('📈 Form Guide').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`team_next:${team.id}`).setLabel('⏱️ Next Match').setStyle(ButtonStyle.Secondary),
        );

        const msg = await interaction.editReply({ embeds: [embed], components: [row] });

        const collector = msg.createMessageComponentCollector({
          filter: (i) => i.customId.startsWith('team_') && i.user.id === interaction.user.id,
          time: 180_000,
        });

        collector.on('collect', async (i) => {
          await i.deferReply({ ephemeral: true });
          const [action, id] = i.customId.split(':');

          if (action === 'team_squad') {
            const sq = await api.getTeamSquad(parseInt(id)).catch(() => null);
            const players = sq?.[0]?.players || [];
            if (!players.length) return i.editReply({ content: '👥 No squad data available.' });

            const byPos = { Goalkeeper: [], Defender: [], Midfielder: [], Attacker: [] };
            for (const p of players) {
              if (byPos[p.position]) byPos[p.position].push(p);
            }

            const squadEmbed = EmbedFactory.profile(`👥 ${team.name} — Full Squad`);

            const posEmoji = { Goalkeeper: '🧤', Defender: '🛡️', Midfielder: '⚙️', Attacker: '⚽' };
            for (const [pos, list] of Object.entries(byPos)) {
              if (!list.length) continue;
              squadEmbed.addFields({
                name: `${posEmoji[pos]} ${pos}s (${list.length})`,
                value: list.slice(0, 10).map((p) => `${p.number ? `#${p.number}` : '—'} **${p.name}**`).join('\n'),
                inline: true,
              });
            }

            await i.editReply({ embeds: [squadEmbed] });
          }

          if (action === 'team_form') {
            const [, tid, tname] = i.customId.split(':');
            const fx = await api.getFixturesByTeam(parseInt(tid), 5).catch(() => []);
            const done = fx?.filter((f) => ['FT', 'AET'].includes(f.fixture?.status?.short)) || [];

            if (!done.length) return i.editReply({ content: '📈 No recent form data available.' });

            const lines = done.map((f) => {
              const isHome = f.teams?.home?.id === parseInt(tid);
              const myG = isHome ? f.goals?.home ?? 0 : f.goals?.away ?? 0;
              const oppG = isHome ? f.goals?.away ?? 0 : f.goals?.home ?? 0;
              const opp = isHome ? f.teams?.away?.name : f.teams?.home?.name;
              const result = myG > oppG ? '🟢 W' : myG === oppG ? '🟡 D' : '🔴 L';
              return `${result} vs **${opp}** — ${myG}-${oppG}`;
            });

            const formEmbed = EmbedFactory.base(`📈 ${tname} — Recent Form`).setDescription(lines.join('\n'));
            await i.editReply({ embeds: [formEmbed] });
          }

          if (action === 'team_next') {
            const fx = await api.getFixturesByTeam(parseInt(id), 10).catch(() => []);
            const next = fx?.find((f) => f.fixture?.status?.short === 'NS');

            if (!next) return i.editReply({ content: '⏱️ No upcoming fixtures found.' });

            const isHome = next.teams?.home?.id === parseInt(id);
            const opp = isHome ? next.teams?.away?.name : next.teams?.home?.name;
            const kickoff = `<t:${Math.floor(new Date(next.fixture.date).getTime() / 1000)}:F>`;

            const nextEmbed = EmbedFactory.base('⏱️ Next Match')
              .setDescription(
                `${isHome ? `🏠 **${team.name}** vs ${opp}` : `✈️ ${opp} vs **${team.name}**`}\n\n` +
                `📅 ${kickoff}\n🏆 ${next.league?.name}`
              );
            await i.editReply({ embeds: [nextEmbed] });
          }
        });

      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Error', err.message || 'Failed to fetch team info. Please try again.')],
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
