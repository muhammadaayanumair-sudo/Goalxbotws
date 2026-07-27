'use strict';

const { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { logger } = require('../../utils/logger');

const FOCUS_SUFFIX = {
  tactics:   ' Focus especially on their tactical system, pressing style, and formation flexibility.',
  stats:     ' Focus especially on statistical output, form, and key performance indicators.',
  transfers: ' Focus especially on transfer activity, squad value, and recruitment strategy.',
  season:    ' Focus especially on their season prospects, title chances, and objectives.',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('analyze')
    .setDescription('🧠 AI-powered analysis of a team, player, or head-to-head matchup')
    .addStringOption((o) => o
      .setName('type')
      .setDescription('🧠 What to analyze')
      .setRequired(true)
      .addChoices(
        { name: '🧠 Team Analysis',                   value: 'team'   },
        { name: '🧠 Player Analysis',                  value: 'player' },
        { name: '🧠 Head-to-Head (Team A vs Team B)', value: 'h2h'  },
        { name: '🧠 Opponent Scouting Report', value: 'opponent' },
      ))
    .addStringOption((o) => o
      .setName('name')
      .setDescription('🏷️ Team name, player name, or "Team A vs Team B" for H2H')
      .setRequired(true))
    .addStringOption((o) => o
      .setName('focus')
      .setDescription('🧠 Optional focus area for deeper analysis')
      .setRequired(false)
      .addChoices(
        { name: '🧠 Tactics & Formation',     value: 'tactics'   },
        { name: '🧠 Statistics & Form',       value: 'stats'     },
        { name: '🧠 Transfer & Market Value', value: 'transfers' },
        { name: '🧠 Season Outlook',           value: 'season'   },
      )),

  cooldown: 20,

  async execute(interaction, client) {
    try {
      await interaction.deferReply();

      const ai    = client.aiRouter;
      const api   = new FootballApiManager(client.cache);
      const type  = interaction.options.getString('type');
      const name  = interaction.options.getString('name');
      const focus = interaction.options.getString('focus') || null;
      const focusSuffix = focus ? FOCUS_SUFFIX[focus] || '' : '';

      try {
        let analysis  = '';
        let statsData = null;
        let embedTitle, embedEmoji;

        // ── Team ─────────────────────────────────────────────────────────────
        if (type === 'team') {
          embedEmoji = '⚽';
          embedTitle = `Team Analysis: ${name}`;
          try {
            const teams = await api.searchTeam(name);
            if (teams?.length > 0) {
              const t    = teams[0].team;
              const fixt = await api.getFixturesByTeam(t.id, 5);
              statsData  = { name: t.name, country: t.country, founded: t.founded, recentFixtures: fixt?.length || 0 };
            }
          } catch { /* stats optional */ }
          // Build enriched team prompt with focus
          const prompt = statsData
            ? `Analyze the football club **${name}** using this data: ${JSON.stringify(statsData)}.\n\nCover: tactical setup, current form, key players, strengths, weaknesses, and season outlook.${focusSuffix}`
            : `Provide a comprehensive analysis of **${name}**. Cover: history, current squad strengths, tactical approach, key players, weaknesses, and current season expectations.${focusSuffix}`;
          analysis = await ai.analyzeTeam(name, statsData);
          // If focus adds meaningful context, do a follow-up focused chat
          if (focus && analysis) {
            const followUp = await ai.chat(
              `analyze_focus_${interaction.user.id}`,
              `Based on the analysis of ${name}: ${focusSuffix.trim()} Give 2-3 additional specific insights on this focus area only, in 200 words max.`
            ).catch(() => null);
            if (followUp) analysis = `${analysis}\n\n---\n**📌 Focus — ${focus}:** ${followUp}`;
          }
        }

        // ── Player ───────────────────────────────────────────────────────────
        else if (type === 'player') {
          embedEmoji = '👤';
          embedTitle = `Player Analysis: ${name}`;
          try {
            const players = await api.searchPlayer(name);
            if (players?.length > 0) {
              const stats = players[0].statistics?.[0];
              const info  = players[0].player;
              statsData   = {
                name:        info?.name,
                nationality: info?.nationality,
                age:         info?.age,
                goals:       stats?.goals?.total,
                assists:     stats?.goals?.assists,
                appearances: stats?.games?.appearences,
                team:        stats?.team?.name,
                league:      stats?.league?.name,
                rating:      stats?.games?.rating,
                position:    stats?.games?.position,
              };
            }
          } catch { /* stats optional */ }
          analysis = await ai.analyzePlayer(name, statsData);
          if (focus && analysis) {
            const followUp = await ai.chat(
              `analyze_focus_${interaction.user.id}`,
              `Based on the analysis of player ${name}: ${focusSuffix.trim()} Give 2-3 specific additional insights on this focus area only, in 200 words max.`
            ).catch(() => null);
            if (followUp) analysis = `${analysis}\n\n---\n**📌 Focus — ${focus}:** ${followUp}`;
          }
        }

        // ── Head-to-Head ─────────────────────────────────────────────────────
        else if (type === 'h2h') {
          embedEmoji = '⚔️';
          embedTitle = `Head-to-Head: ${name}`;

          const parts = name.split(/\s+vs\.?\s+/i);
          const teamA = parts[0]?.trim() || name;
          const teamB = parts[1]?.trim() || 'the opponent';

          const prompt = [
            `Provide a detailed head-to-head preview of **${teamA} vs ${teamB}** structured as:`,
            '1. **Historical Record** — notable past results and rivalry',
            '2. **Current Form** — how each team is playing right now',
            '3. **Tactical Matchup** — how their styles interact',
            '4. **Key Players** — 1-2 decisive players from each side',
            '5. **Prediction** — predicted score and brief reasoning',
            focusSuffix,
          ].filter(Boolean).join('\n');

          analysis = await ai.chat(`h2h_${interaction.user.id}`, prompt);
        }

        // ── Opponent Scouting ───────────────────────────────────────────────
        else if (type === 'opponent') {
          embedEmoji = '🛡️';
          embedTitle = `Opponent Scout: ${name}`;

          try {
            const teams = await api.searchTeam(name);
            if (teams?.length > 0) {
              const t    = teams[0].team;
              const fixt = await api.getFixturesByTeam(t.id, 5);
              statsData  = { name: t.name, country: t.country, founded: t.founded, recentFixtures: fixt?.length || 0 };
            }
          } catch { /* stats optional */ }

          const prompt = statsData
            ? `Scout the upcoming opponent **${name}** using this data: ${JSON.stringify(statsData)}.\n\nCover: likely formation, tactical threats, key players to watch, weaknesses to exploit, and recommended strategy to beat them.${focusSuffix}`
            : `Scout the upcoming opponent **${name}**. Cover: likely formation, tactical threats, key players to watch, weaknesses to exploit, and recommended strategy to beat them.${focusSuffix}`;

          analysis = await ai.chat(`scout_opponent_${interaction.user.id}`, prompt);
        }

        // ── Build embed ───────────────────────────────────────────────────────
        const focusLabel = focus ? ` · Focus: ${focus.charAt(0).toUpperCase() + focus.slice(1)}` : '';
        const desc       = (analysis || 'Analysis unavailable.').slice(0, 3900);

        const embed = EmbedFactory.ai(`${embedEmoji} ${embedTitle}`)
          .setDescription(desc)
          .setFooter({ text: `⚽ Powered by GoalX · AI Analysis${focusLabel} · Powered by Groq/OpenRouter` });

        if (statsData) {
          const statLines = Object.entries(statsData)
            .filter(([, v]) => v != null)
            .map(([k, v]) => `**${k.replace(/([A-Z])/g, ' $1').trim()}:** ${v}`)
            .slice(0, 6);
          if (statLines.length) {
            embed.addFields({ name: '🧠 Live Data', value: statLines.join('\n'), inline: false });
          }
        }

                const helpRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('help:analyze')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed] ,
          components: [helpRow]});
      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Analysis Failed', err.message || 'Could not complete analysis. Please try again.')],
        });
      }
    } catch (error) {
      const expired = error.code === 10062;
      if (!expired) logger.error('[analyze] execute error:', error);
      try {
        const msg = { embeds: [EmbedFactory.error('Something went wrong', error.message || 'Unexpected error.')], flags: 64 };
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else if (!expired) await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
