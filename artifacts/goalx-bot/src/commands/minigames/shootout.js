'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { EconomyService } = require('../../services/economy/EconomyService');
const { AchievementService } = require('../../services/AchievementService');
const { logger } = require('../../utils/logger');

const DIRS   = ['left', 'center', 'right'];
const EMOJI  = { left: '⬅️', center: '⬆️', right: '➡️' };
const LABEL  = { left: 'Left', center: 'Centre', right: 'Right' };
const TOTAL_ROUNDS = 3;
const WIN_THRESHOLD = 2; // need 2+ goals to win

function buildDirButtons(disabled = false, style = ButtonStyle.Primary) {
  return new ActionRowBuilder().addComponents(
    DIRS.map((d) =>
      new ButtonBuilder()
        .setCustomId(`shoot_${d}`)
        .setLabel(LABEL[d])
        .setEmoji(EMOJI[d])
        .setStyle(style)
        .setDisabled(disabled)
    )
  );
}

function scoreDisplay(goals, saves) {
  const g = '⚽'.repeat(goals) + '▫️'.repeat(TOTAL_ROUNDS - goals - saves);
  const s = '🧤'.repeat(saves);
  return `${g}${s}`;
}

function buildRoundEmbed(round, playerGoals, keeperSaves, bet, username, extras = {}) {
  const remaining = TOTAL_ROUNDS - round + 1;
  const color     = '#FFD700';

  const lines = [
    `**Round ${round} of ${TOTAL_ROUNDS}** — ${remaining > 0 ? `${remaining} kick${remaining === 1 ? '' : 's'} left` : 'Final kick'}`,
    '',
    `⚽ **Goals:** ${playerGoals}  🧤 **Saves:** ${keeperSaves}  ▫️ **Remaining:** ${TOTAL_ROUNDS - playerGoals - keeperSaves}`,
    `\`${scoreDisplay(playerGoals, keeperSaves)}\``,
    '',
    `💰 Wager: **${bet} coins**  ·  Win = **2×** your bet`,
    '',
  ];

  if (extras.lastResult) lines.push(`> ${extras.lastResult}`);

  lines.push('', '**🎯 Where do you aim?**');

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🥅 3-2 Shootout')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `GoalX Mini Games · ${username} · Score ${WIN_THRESHOLD}+ to win` })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shootout')
    .setDescription('🥅 3-kick shootout — score 2 out of 3 to win your bet! 🥅')
    .addIntegerOption((o) => o
      .setName('bet')
      .setDescription('🥅 Coins to wager (default: 100, max: 3000)')
      .setMinValue(20)
      .setMaxValue(3000)),

  cooldown: 45,

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const bet      = interaction.options.getInteger('bet') ?? 100;
      const userId   = interaction.user.id;
      const username = interaction.user.username;

      const user = await EconomyService.getUser(userId, username);
      if (user.coins < bet) {
        return interaction.editReply({
          embeds: [EmbedFactory.error('Not Enough Coins',
            `You need **${bet} coins** to play but only have **${user.coins}**.\n\nTry a smaller bet or earn more with \`/daily\`.`)],
        });
      }

      // ── Game state ──────────────────────────────────────────────────────────
      let round       = 1;
      let playerGoals = 0;
      let keeperSaves = 0;

      // Show round 1 prompt
      const msg = await interaction.editReply({
        embeds: [buildRoundEmbed(round, playerGoals, keeperSaves, bet, username)],
        components: [buildDirButtons()],
      });

      // ── Sequential round collector ──────────────────────────────────────────
      const playRound = () => new Promise((resolve) => {
        const coll = msg.createMessageComponentCollector({
          filter: (i) => i.user.id === userId && i.customId.startsWith('shoot_'),
          time: 20_000,
          max: 1,
        });

        coll.on('collect', async (btn) => {
          await btn.deferUpdate().catch(() => {});

          const playerDir = btn.customId.replace('shoot_', '');
          const keeperDir = DIRS[Math.floor(Math.random() * 3)];
          const scored    = playerDir !== keeperDir;

          if (scored) playerGoals++;
          else keeperSaves++;

          const grid = DIRS.map((d) => {
            const shot = d === playerDir;
            const dive = d === keeperDir;
            if (shot && !scored) return `[${EMOJI[d]}🧤]`;
            if (shot)            return `[${EMOJI[d]}⚽]`;
            if (dive)            return `[${EMOJI[d]}🧤]`;
            return '[ ▫️ ]';
          }).join(' ');

          const lastResult = scored
            ? `✅ **GOAL!** You shot ${EMOJI[playerDir]}, keeper dived ${EMOJI[keeperDir]} ${grid}`
            : `❌ **SAVED!** You shot ${EMOJI[playerDir]}, keeper dived ${EMOJI[keeperDir]} ${grid}`;

          resolve({ scored, lastResult, timedOut: false });
        });

        coll.on('end', (collected) => {
          if (!collected.size) resolve({ scored: false, lastResult: '⏱️ *Time up — kick missed!*', timedOut: true });
        });
      });

      // ── Run 3 rounds ────────────────────────────────────────────────────────
      for (round = 1; round <= TOTAL_ROUNDS; round++) {
        const { scored, lastResult, timedOut } = await playRound();

        const isLast    = round === TOTAL_ROUNDS;
        const canWin    = playerGoals + (TOTAL_ROUNDS - round) >= WIN_THRESHOLD;  // still possible to win
        const hasLost   = !canWin && !isLast; // mathematically impossible to win

        if (!isLast && !hasLost) {
          // Update embed for next round
          await interaction.editReply({
            embeds: [buildRoundEmbed(round + 1, playerGoals, keeperSaves, bet, username, { lastResult })],
            components: [buildDirButtons()],
          });
        } else {
          // Final result
          const won = playerGoals >= WIN_THRESHOLD;

          if (won) {
            user.addCoins(bet);
            await user.addXp(30);
          } else {
            user.deductCoins(bet);
          }
          await user.save();

          const resultEmbed = new EmbedBuilder()
            .setColor(won ? '#44FF88' : '#FF4444')
            .setTitle(won ? '🏆 You Won the Shootout!' : '😔 Shootout Lost')
            .setDescription([
              `> ${lastResult}`,
              '',
              `**Final Score: ${playerGoals} goals / ${keeperSaves} saves / ${TOTAL_ROUNDS - playerGoals - keeperSaves} remaining**`,
              `\`${scoreDisplay(playerGoals, keeperSaves)}\``,
              '',
              won
                ? `🎉 You scored **${playerGoals}/${TOTAL_ROUNDS}** — you win **+${bet} coins**!`
                : `💸 You only scored **${playerGoals}/${TOTAL_ROUNDS}** — you lose **-${bet} coins**.`,
              `🪙 New balance: **${user.coins} coins**`,
            ].join('\n'))
            .setFooter({ text: `GoalX Mini Games · 3-2 Shootout · ${username}` })
            .setTimestamp();

          await interaction.editReply({
            embeds: [resultEmbed],
            components: [buildDirButtons(true, won ? ButtonStyle.Success : ButtonStyle.Danger)],
          });

          if (won) await AchievementService.checkAndAward(userId);
          break;
        }

        if (hasLost) break;
      }

    } catch (error) {
      const expired = error.code === 10062;
      if (!expired) logger.error('[shootout] execute error:', error);
      try {
        const msg = { embeds: [EmbedFactory.error('Error', error.message || 'Something went wrong.')], flags: 64 };
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else if (!expired) await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
