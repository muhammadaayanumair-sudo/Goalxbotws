'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { EmbedFactory }    = require('../../utils/embed');
const { formatCoins }     = require('../../utils/formatters');
const { TeamService }     = require('../../services/team/TeamService');
const User                = require('../../models/User');
const { logger } = require('../../utils/logger');

// ─── Utilities ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Simple Poisson sampler — caps at 7 so no cricket scores. */
function poissonSample(lambda) {
  const L = Math.exp(-Math.max(0.15, lambda));
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return Math.min(k - 1, 7);
}

/** Progress bar — 16 chars wide, shows match minute out of 90. */
function matchBar(minute) {
  const filled = Math.min(16, Math.floor((minute / 90) * 16));
  return '`[' + '█'.repeat(filled) + '░'.repeat(16 - filled) + '] ' + minute + "'`";
}

/** Grabs a player name from the team, filtered by position if possible. */
function pickPlayer(team, position = null) {
  let pool = team.players || [];
  if (position && pool.some((p) => p.position === position)) {
    pool = pool.filter((p) => p.position === position);
  }
  if (!pool.length) return 'A player';
  return pool[Math.floor(Math.random() * pool.length)].playerName;
}

// ─── Commentary banks ─────────────────────────────────────────────────────────

const GOAL_LINES = [
  (p, t) => `🥅 **GOAL!!** ${p} fires low past the keeper! **${t}** are in front!`,
  (p, t) => `🥅 **GOAL!!** Absolute rocket from ${p}! Nothing the keeper could do!`,
  (p, t) => `🥅 **GOAL!!** ${p} taps it home from close range — clinical finish for **${t}**!`,
  (p, t) => `🥅 **GOAL!!** ${p} powers a header into the top corner! **${t}** score!`,
  (p, t) => `🥅 **GOAL!!** ${p} latches onto the through ball and slots it home! **${t}**!`,
  (p, t) => `🥅 **GOAL!!** Stunning volley from ${p}! **${t}** go ahead!`,
  (p, t) => `🥅 **GOAL!!** ${p} dribbles past two defenders and fires into the net!`,
];

const MISS_LINES = [
  (p) => `💨 ${p} dribbles past the defence but fires well wide of the post!`,
  (p) => `🚀 ${p} unleashes a thunderbolt — it smashes off the crossbar! So close!`,
  (p) => `😬 ${p} was clean through on goal but blazed it over the bar!`,
  (p) => `🧤 Incredible save! The keeper denies ${p} at point-blank range!`,
  (p) => `📐 ${p}'s curling effort clips the post and trickles out for a goal-kick!`,
  (p) => `🙈 ${p} had the whole goal to aim at — headed straight at the keeper!`,
  (p) => `💥 ${p} cuts inside and shoots — deflected wide for a corner!`,
];

const OTHER_LINES = [
  (p) => `🟨 Yellow card! ${p} goes into the book for a reckless challenge.`,
  (p) => `📌 Offside! ${p}'s perfectly timed run is ruled out by the linesman.`,
  (p) => `🔄 Substitution: ${p} is replaced — fresh legs enter the fray.`,
  (p) => `🎯 ${p} wins a corner after a last-ditch clearance. The crowd rises!`,
  (p) => `📺 VAR is checking a potential handball involving ${p}. Tense wait...`,
  (p) => `🏃 ${p} breaks on the counter-attack at pace — but the defence scrambles back!`,
  (p) => `💢 Crunching tackle from ${p}! The ref plays on — just about.`,
  (p) => `🎪 ${p} nutmegs the defender and bursts into the box — wins a corner!`,
  (p) => `🤕 ${p} goes down with a knock. The physio rushes on, play pauses briefly.`,
  (p) => `🎩 ${p} lofts a delightful cross into the box — cleared just in time!`,
];

// ─── Match Engine ─────────────────────────────────────────────────────────────

/**
 * Pre-generates all match events before kick-off.
 * Returns { events, homeGoals, awayGoals }.
 */
function simulateMatch(homeTeam, awayTeam) {
  const homeRating = homeTeam.teamRating || 68;
  const awayRating = awayTeam.teamRating || 68;
  const diff       = (homeRating - awayRating) / 25;

  const homeExp = Math.max(0.25, 1.5 + diff + (Math.random() * 0.5 - 0.25));
  const awayExp = Math.max(0.25, 1.1 - diff + (Math.random() * 0.5 - 0.25));

  const homeGoals = poissonSample(homeExp);
  const awayGoals = poissonSample(awayExp);

  const events  = [];
  const usedMin = new Set();

  const randMin = (lo = 1, hi = 90) => {
    let m;
    let attempts = 0;
    do {
      m = Math.floor(Math.random() * (hi - lo + 1)) + lo;
      attempts++;
    } while (usedMin.has(m) && attempts < 200);
    usedMin.add(m);
    return m;
  };

  // Goals
  for (let i = 0; i < homeGoals; i++) {
    const min      = randMin();
    const attacker = pickPlayer(homeTeam, 'Attacker');
    const line     = GOAL_LINES[Math.floor(Math.random() * GOAL_LINES.length)];
    events.push({ minute: min, team: 'home', type: 'goal', text: `${min}' ${line(attacker, homeTeam.teamName)}` });
  }
  for (let i = 0; i < awayGoals; i++) {
    const min      = randMin();
    const attacker = pickPlayer(awayTeam, 'Attacker');
    const line     = GOAL_LINES[Math.floor(Math.random() * GOAL_LINES.length)];
    events.push({ minute: min, team: 'away', type: 'goal', text: `${min}' ${line(attacker, awayTeam.teamName)}` });
  }

  // Shot attempts (4–7)
  const chances = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < chances; i++) {
    const min    = randMin();
    const isHome = Math.random() < 0.5;
    const team   = isHome ? homeTeam : awayTeam;
    const player = pickPlayer(team, 'Attacker');
    const line   = MISS_LINES[Math.floor(Math.random() * MISS_LINES.length)];
    events.push({ minute: min, team: isHome ? 'home' : 'away', type: 'chance', text: `${min}' ${line(player)}` });
  }

  // Other incidents (4–7)
  const others = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < others; i++) {
    const min    = randMin();
    const isHome = Math.random() < 0.5;
    const team   = isHome ? homeTeam : awayTeam;
    const player = pickPlayer(team);
    const line   = OTHER_LINES[Math.floor(Math.random() * OTHER_LINES.length)];
    events.push({ minute: min, team: isHome ? 'home' : 'away', type: 'other', text: `${min}' ${line(player)}` });
  }

  events.sort((a, b) => a.minute - b.minute);
  return { events, homeGoals, awayGoals };
}

/**
 * Counts goals for a team up to a given match minute.
 */
function scoreAt(events, team, minute) {
  return events.filter((e) => e.team === team && e.type === 'goal' && e.minute <= minute).length;
}

/**
 * Builds the live match embed for a given minute update.
 */
function buildLiveEmbed(homeTeam, awayTeam, matchData, minute, log, isFT = false) {
  const { events } = matchData;
  const hs = scoreAt(events, 'home', minute);
  const as = scoreAt(events, 'away', minute);

  const title  = isFT ? '🏁 FULL TIME' : minute === 45 ? '⏸️ HALF TIME' : '⚽ LIVE MATCH';
  const color  = isFT ? (hs === as ? 0xFFD700 : 0x44FF88) : 0xFF4444;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${title}  ·  ${homeTeam.teamName} vs ${awayTeam.teamName}`)
    .setDescription(
      matchBar(minute) + '\n\n' +
      `🏠 **${homeTeam.teamName}**   \`${hs}  —  ${as}\`   **${awayTeam.teamName}** ✈️`
    )
    .setTimestamp();

  if (log.length) {
    embed.addFields({
      name: '📋 Match Events',
      value: log.slice(-7).join('\n').slice(0, 1024),
    });
  }

  if (isFT) {
    const result = hs > as
      ? `🏆 **${homeTeam.teamName}** win!`
      : as > hs
        ? `🏆 **${awayTeam.teamName}** win!`
        : `🤝 It's a **Draw!**`;
    embed.addFields({ name: '🏟️ Final Result', value: result });
  }

  embed.setFooter({ text: `⚽ GoalX Match Engine  ·  ${isFT ? 'Full Time' : minute + "'"}` });
  return embed;
}

// ─── Command ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kickoff')
    .setDescription('🏟️ Challenge someone to a live head-to-head match with your card teams!')
    .addUserOption((opt) =>
      opt.setName('opponent').setDescription('🏟️ Who to challenge').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('stake')
        .setDescription('🏟️ Coins to wager — loser pays the winner (optional)')
        .setRequired(false)
        .setMinValue(100)
        .setMaxValue(50000)
    ),

  cooldown: 90,

  async execute(interaction, client) {
  try {
      const opponent = interaction.options.getUser('opponent');
      const stake    = interaction.options.getInteger('stake') || 0;

      // Basic guards
      if (opponent.bot || opponent.id === interaction.user.id) {
        return interaction.reply({
          embeds: [EmbedFactory.error('Invalid Opponent', 'You can\'t challenge yourself or a bot.')],
          ephemeral: true,
        });
      }

      if (stake > 0) {
        const me = await User.findOne({ userId: interaction.user.id }).lean();
        if (!me || me.coins < stake) {
          return interaction.reply({
            embeds: [EmbedFactory.error('Insufficient Coins', `You need **${formatCoins(stake)}** to place this stake.`)],
            ephemeral: true,
          });
        }
      }

      // Load challenger's team
      const challengerTeam = await TeamService.getOrCreate(interaction.user.id);

      // ── Challenge embed ────────────────────────────────────────────
      const challengeEmbed = new EmbedBuilder()
        .setColor(0x00D4FF)
        .setTitle('⚽ Match Challenge!')
        .setDescription(
          `**${interaction.user.username}** challenges **${opponent.username}** to a live card-team match!\n\n` +
          `🏠 **${challengerTeam.teamName}**\n` +
          `⭐ Rating: **${challengerTeam.teamRating || '—'}**  ·  Players: **${challengerTeam.players.length}/11**`
        )
        .addFields(
          { name: '🏟️ Stake',    value: stake > 0 ? `${formatCoins(stake)} each side` : 'Friendly — no coins at risk', inline: true },
          { name: '🏟️ Duration', value: '30 seconds real time · 90 match minutes',                                     inline: true },
          { name: '🏟️ Expires',  value: 'Challenge expires in **2 minutes**',                                           inline: false },
        )
        .setFooter({ text: `${opponent.username} — will you accept?` })
        .setTimestamp();

      const acceptBtn  = new ButtonBuilder().setCustomId('kickoff_accept').setLabel('✅ Accept & Kick Off').setStyle(ButtonStyle.Success);
      const declineBtn = new ButtonBuilder().setCustomId('kickoff_decline').setLabel('❌ Decline').setStyle(ButtonStyle.Danger);
      const row        = new ActionRowBuilder().addComponents(acceptBtn, declineBtn);

      const msg = await interaction.reply({
        content: `${opponent} — you've been challenged to a match!`,
        embeds: [challengeEmbed],
        components: [row],
        fetchReply: true,
      });

      // ── Wait for opponent ──────────────────────────────────────────
      const collector = msg.createMessageComponentCollector({
        filter: (i) => ['kickoff_accept', 'kickoff_decline'].includes(i.customId) && i.user.id === opponent.id,
        time: 120_000,
        max: 1,
      });

      collector.on('collect', async (btnInt) => {
        if (btnInt.customId === 'kickoff_decline') {
          await btnInt.update({
            content: '',
            embeds: [EmbedFactory.warning('Challenge Declined', `**${opponent.username}** declined the match. No coins were moved.`)],
            components: [],
          });
          return;
        }

        // ── Accepted ──────────────────────────────────────────────
        // Check opponent's coins for stake
        if (stake > 0) {
          const them = await User.findOne({ userId: opponent.id }).lean();
          if (!them || them.coins < stake) {
            await btnInt.update({
              content: '',
              embeds: [EmbedFactory.error('Not Enough Coins', `**${opponent.username}** doesn't have **${formatCoins(stake)}** to match the stake.`)],
              components: [],
            });
            return;
          }
        }

        await btnInt.update({
          content: '',
          embeds: [
            new EmbedBuilder()
              .setColor(0xFFD700)
              .setTitle('⚽ Match Accepted! Kick-off in 3...')
              .setDescription(`**${interaction.user.username}** vs **${opponent.username}**\nGenerating teams and match events...`)
              .setTimestamp(),
          ],
          components: [],
        });

        // Fetch both teams
        const [homeTeam, awayTeam] = await Promise.all([
          TeamService.getOrCreate(interaction.user.id),
          TeamService.getOrCreate(opponent.id),
        ]);

        // Set team display names
        homeTeam._displayUser = interaction.user.username;
        awayTeam._displayUser  = opponent.username;

        // Deduct stakes
        if (stake > 0) {
          await Promise.all([
            User.findOneAndUpdate({ userId: interaction.user.id }, { $inc: { coins: -stake } }),
            User.findOneAndUpdate({ userId: opponent.id },         { $inc: { coins: -stake } }),
          ]);
        }

        // Generate the full match
        const matchData = simulateMatch(homeTeam, awayTeam);

        await sleep(3000); // Brief dramatic pause

        // ── Match loop: 10 updates over 30s (3s each = 90 match minutes) ──
        const MINUTES    = [9, 18, 27, 36, 45, 54, 63, 72, 81, 90];
        const INTERVAL   = 3000;
        const eventLog   = [];

        for (let idx = 0; idx < MINUTES.length; idx++) {
          const curMin  = MINUTES[idx];
          const prevMin = idx === 0 ? 0 : MINUTES[idx - 1];

          // Collect events for this window
          const window = matchData.events.filter((e) => e.minute > prevMin && e.minute <= curMin);
          for (const ev of window) eventLog.push(ev.text);

          // Half time banner
          if (curMin === 45) {
            const hs = scoreAt(matchData.events, 'home', 45);
            const as = scoreAt(matchData.events, 'away', 45);
            eventLog.push(`45' ⏸️ **HALF TIME** — ${homeTeam.teamName} **${hs}** — **${as}** ${awayTeam.teamName}`);
          }

          const isFT = curMin === 90;
          const embed = buildLiveEmbed(homeTeam, awayTeam, matchData, curMin, eventLog, isFT);
          await btnInt.editReply({ embeds: [embed] });

          if (!isFT) await sleep(INTERVAL);
        }

        // ── Full-time payouts ──────────────────────────────────────
        const { homeGoals, awayGoals } = matchData;
        const homeWon = homeGoals > awayGoals;
        const awayWon = awayGoals > homeGoals;
        const draw    = homeGoals === awayGoals;

        if (stake > 0) {
          if (draw) {
            await Promise.all([
              User.findOneAndUpdate({ userId: interaction.user.id }, { $inc: { coins: stake } }),
              User.findOneAndUpdate({ userId: opponent.id },         { $inc: { coins: stake } }),
            ]);
          } else {
            const winnerId = homeWon ? interaction.user.id : opponent.id;
            await User.findOneAndUpdate({ userId: winnerId }, { $inc: { coins: stake * 2 } });
          }
        }

        // XP reward for both
        await Promise.all([
          User.findOneAndUpdate({ userId: interaction.user.id }, { $inc: { xp: 35 } }),
          User.findOneAndUpdate({ userId: opponent.id },         { $inc: { xp: 35 } }),
        ]);

        // ── Result summary follow-up ───────────────────────────────
        const winnerName = homeWon
          ? interaction.user.username
          : awayWon
            ? opponent.username
            : null;

        const resultEmbed = new EmbedBuilder()
          .setColor(draw ? 0xFFD700 : 0x00D4FF)
          .setTitle('🏆 Full Time — Match Summary')
          .setDescription(
            `**${homeTeam.teamName}** (${interaction.user.username})   \`${homeGoals} — ${awayGoals}\`   (${opponent.username}) **${awayTeam.teamName}**\n\n` +
            (draw
              ? `🤝 **Draw!**${stake > 0 ? ' Both players receive their stake back.' : ''}`
              : `🏆 **${winnerName}** wins the match!${stake > 0 ? ` Collects **${formatCoins(stake * 2)}**!` : ''}`
            )
          )
          .addFields(
            {
              name: `🏠 ${homeTeam.teamName}`,
              value: `Goals: **${homeGoals}**\nTeam Rating: ⭐ ${homeTeam.teamRating || '—'}\nPlayers: ${homeTeam.players.length}/11`,
              inline: true,
            },
            {
              name: `✈️ ${awayTeam.teamName}`,
              value: `Goals: **${awayGoals}**\nTeam Rating: ⭐ ${awayTeam.teamRating || '—'}\nPlayers: ${awayTeam.players.length}/11`,
              inline: true,
            },
            { name: '🏟️ \u200B', value: '*Both players earn +35 XP for playing.*', inline: false },
          )
          .setFooter({ text: '⚽ GoalX Match Engine · Use /myteam best to build a stronger team' })
          .setTimestamp();

        await interaction.followUp({ embeds: [resultEmbed] });
      });

      collector.on('end', async (_c, reason) => {
        if (reason === 'time') {
          await interaction.editReply({
            content: '',
            embeds: [EmbedFactory.warning('Challenge Expired', 'The match challenge wasn\'t accepted in time.')],
            components: [],
          }).catch(() => {});
        }
      });
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
