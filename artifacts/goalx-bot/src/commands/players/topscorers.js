'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { LEAGUES, CURRENT_SEASON } = require('../../constants/leagues');
const { logger } = require('../../utils/logger');
const { safeErrorMessage } = require('../../utils/teamNameUtils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('topscorers')
    .setDescription('🥅 View top scorers — no ID needed')
    .addStringOption((opt) =>
      opt.setName('league').setDescription('🥅 League name (default: Premier League)').setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt.setName('season').setDescription('🥅 Season year (default: current)').setRequired(false)
    ),

  cooldown: 20,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const leagueInput = interaction.options.getString('league') || 'Premier League';
      const season      = interaction.options.getInteger('season') || CURRENT_SEASON;

      try {
        let leagueId   = LEAGUES.PREMIER_LEAGUE.id;
        let leagueName = 'Premier League';
        let leagueLogo = null;

        const key = Object.keys(LEAGUES).find((k) =>
          LEAGUES[k].name.toLowerCase().includes(leagueInput.toLowerCase())
        );
        if (key) {
          leagueId   = LEAGUES[key].id;
          leagueName = LEAGUES[key].name;
        } else if (!isNaN(leagueInput)) {
          leagueId   = parseInt(leagueInput);
          leagueName = `League ${leagueId}`;
        }

        const scorers = await api.getTopScorers(leagueId, season) || [];

        if (!scorers.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('No Data', `No top scorer data for **${leagueName}** (${season}).`)],
          });
        }

        leagueLogo = leagueLogo || scorers[0]?.statistics?.[0]?.league?.logo || null;

        const medals = ['🥇', '🥈', '🥉'];
        const top6   = scorers.slice(0, 6);
        const leader = scorers[0];
        const lStats = leader.statistics?.[0];
        const lGoals = lStats?.goals?.total || 0;

        let desc = `🥇 **${leader.player?.name}** · *${lStats?.team?.name || 'N/A'}* — **${lGoals}** ⚽ · **${lStats?.goals?.assists || 0}** 🅰️\n\n`;
        desc += `---\n**🏅 Chasing Pack**\n\n`;

        for (let i = 1; i < Math.min(6, scorers.length); i++) {
          const entry  = scorers[i];
          const stats  = entry.statistics?.[0];
          const goals  = stats?.goals?.total    || 0;
          const diff   = lGoals - goals;
          const medal  = medals[i] || `**${i + 1}.**`;
          desc += `${medal} **${entry.player.name}** · *${stats?.team?.name || 'N/A'}* — **${goals}** ⚽ · **${stats?.goals?.assists || 0}** 🅰️`;
          if (diff > 0) desc += ` *(–${diff} from leader)*`;
          desc += '\n';
        }

        const totalGoals   = top6.reduce((a, e) => a + (e.statistics?.[0]?.goals?.total   || 0), 0);
        const totalAssists = top6.reduce((a, e) => a + (e.statistics?.[0]?.goals?.assists || 0), 0);
        const teams        = [...new Set(top6.map((e) => e.statistics?.[0]?.team?.name).filter(Boolean))];

        desc += `\n---\n📊 **Quick Stats**\n`;
        desc += `🏟️ **${teams.length}** teams · top ${top6.length}\n`;
        desc += `⚽ **${totalGoals}** combined goals · 🅰️ **${totalAssists}** combined assists\n`;
        desc += `\n⚡ Updated weekly · Tap a player button for the full profile`;

        const embed = EmbedFactory.stats(`🥇 Top Scorers — ${leagueName} ${season}/${season + 1}`, desc);
        if (leagueLogo) embed.setThumbnail(leagueLogo);

        // Player buttons
        const rows = [];
        for (let i = 0; i < Math.min(scorers.length, 10); i += 5) {
          const chunk = scorers.slice(i, i + 5);
          const row   = new ActionRowBuilder();
          for (const entry of chunk) {
            const idx   = scorers.indexOf(entry);
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`topscore_player:${entry.player.id}:${season}`)
                .setLabel(`${medal} ${entry.player.name.slice(0, 18)}`)
                .setStyle(idx === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
            );
          }
          rows.push(row);
        }

        const msg = await interaction.editReply({ embeds: [embed], components: rows });

        const collector = msg.createMessageComponentCollector({
          filter: (i) => i.customId.startsWith('topscore_player:') && i.user.id === interaction.user.id,
          time: 180_000,
        });

        collector.on('collect', async (i) => {
          await i.deferReply({ ephemeral: true });
          const [, playerId, szn] = i.customId.split(':');

          const playerData = await api.getPlayerById(parseInt(playerId), parseInt(szn)).catch(() => null);
          const pd = playerData?.[0];
          if (!pd) return i.editReply({ content: '❌ Player data unavailable.' });

          const p  = pd.player;
          const st = pd.statistics?.[0];

          const profileEmbed = EmbedFactory.profile(`⚽ ${p.name}`).setThumbnail(p.photo || null);

          EmbedFactory.addFields(profileEmbed, [
            { name: '🥅 Club', value: st?.team?.name || 'N/A', inline: true },
            { name: '🥅 Nationality', value: p.nationality || 'N/A', inline: true },
            { name: '🥅 Age', value: String(p.age || '?'), inline: true },
            { name: '🥅 Goals', value: String(st?.goals?.total || 0), inline: true },
            { name: '🥅 Assists', value: String(st?.goals?.assists || 0), inline: true },
            { name: '🥅 Appearances', value: String(st?.games?.appearences || 0), inline: true },
            { name: '🥅 Minutes', value: String(st?.games?.minutes || 0), inline: true },
            { name: '🥅 Yellow Cards', value: String(st?.cards?.yellow || 0), inline: true },
            { name: '🥅 Red Cards', value: String(st?.cards?.red || 0), inline: true },
          ]);
          profileEmbed.setFooter({ text: `⚽ Powered by GoalX · Season ${szn}` });

          await i.editReply({ embeds: [profileEmbed] });
        });

      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Top Scorers Unavailable', safeErrorMessage(err, 'Failed to fetch top scorers. Please try again later.'))],
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
