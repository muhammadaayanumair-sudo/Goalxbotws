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
const { logger } = require('../../utils/logger');

// ── Outcome engine ─────────────────────────────────────────────────────────
//
// Free kick two-step:
//   Step 1 — direction: left / center / right
//   Step 2 — height:    low  / high
//
// Wall blocks center+low always.
// For everything else the keeper randomly dives (left / center / right).
// Outcome: scored if keeper's dive ≠ the shot quadrant.
// High shots over the wall can still be saved if keeper's position matches.

const DIRS = ['left', 'center', 'right'];
const DIR_EMOJI = { left: '⬅️', center: '⬆️', right: '➡️' };
const DIR_LABEL = { left: 'Left', center: 'Centre', right: 'Right' };
const HEIGHT_EMOJI = { low: '🔽', high: '🔼' };
const HEIGHT_LABEL = { low: 'Low', high: 'High' };

function dirButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    DIRS.map((d) =>
      new ButtonBuilder()
        .setCustomId(`fk_dir_${d}`)
        .setLabel(DIR_LABEL[d])
        .setEmoji(DIR_EMOJI[d])
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    )
  );
}

function heightButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    ['low', 'high'].map((h) =>
      new ButtonBuilder()
        .setCustomId(`fk_ht_${h}`)
        .setLabel(HEIGHT_LABEL[h])
        .setEmoji(HEIGHT_EMOJI[h])
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    )
  );
}

function resolveOutcome(dir, height) {
  // Wall always blocks a low central shot
  if (dir === 'center' && height === 'low') {
    return { scored: false, reason: '🧱 The wall blocked your shot!' };
  }

  // High shots above the wall — keeper dives randomly across all positions
  // Low non-central shots — keeper dives randomly
  const keeperDive = DIRS[Math.floor(Math.random() * 3)];
  const scored = keeperDive !== dir;

  const reasons = {
    scored: [
      `🧤 The keeper dived ${DIR_LABEL[keeperDive].toLowerCase()} — your shot crept in!`,
      `The keeper guessed wrong — ${HEIGHT_LABEL[height]} to the ${DIR_LABEL[dir].toLowerCase()}. GOAL!`,
      `💨 Unstoppable ${HEIGHT_LABEL[height].toLowerCase()} ${DIR_LABEL[dir].toLowerCase()} — straight into the net!`,
    ],
    saved: [
      `🧤 Great save! The keeper dived ${DIR_LABEL[keeperDive].toLowerCase()} and got a hand to it.`,
      `The keeper read you perfectly and pushed it around the post.`,
    ],
  };

  const pool = scored ? reasons.scored : reasons.saved;
  const reason = pool[Math.floor(Math.random() * pool.length)];
  return { scored, reason, keeperDive };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('freekick')
    .setDescription('⚽ Set up a free kick — pick your direction and height to beat the wall and keeper! 🎯')
    .addIntegerOption((o) =>
      o
        .setName('bet')
        .setDescription('🪙 Coins to wager (default: 75, max: 3000)')
        .setMinValue(10)
        .setMaxValue(3000)
    ),

  cooldown: 30,

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const bet = interaction.options.getInteger('bet') ?? 75;
      const user = await EconomyService.getUser(
        interaction.user.id,
        interaction.user.username
      );

      if (user.coins < bet) {
        return interaction.editReply({
          embeds: [
            EmbedFactory.error(
              'Not Enough Coins',
              `You need **${bet} coins** to play but only have **${user.coins}**. Try a smaller bet.`
            ),
          ],
        });
      }

      // ── Step 1: Direction ────────────────────────────────────────────────
      const step1Embed = new EmbedBuilder()
        .setColor('#E67E22')
        .setTitle('🎯  Free Kick — Step 1: Direction')
        .setDescription(
          [
            `**${interaction.user.username}** sets the ball on the edge of the box…`,
            '',
            `> 💰 Wager: **${bet} coins**`,
            `> 🪙 Balance: **${user.coins} coins**`,
            '',
            '**Which way do you curl it?**',
            '⏱️ 15 seconds to decide.',
          ].join('\n')
        )
        .setFooter({ text: 'GoalX Mini Games · Free Kick  |  Step 1 of 2' })
        .setTimestamp();

      const msg = await interaction.editReply({
        embeds: [step1Embed],
        components: [dirButtons()],
      });

      const dirCollector = msg.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith('fk_dir_'),
        time: 15_000,
        max: 1,
      });

      dirCollector.on('collect', async (dirBtn) => {
        await dirBtn.deferUpdate().catch(() => {});
        const chosenDir = dirBtn.customId.replace('fk_dir_', '');

        // ── Step 2: Height ───────────────────────────────────────────────
        const step2Embed = new EmbedBuilder()
          .setColor('#E67E22')
          .setTitle('🎯  Free Kick — Step 2: Height')
          .setDescription(
            [
              `Direction: **${DIR_EMOJI[chosenDir]} ${DIR_LABEL[chosenDir]}**`,
              '',
              '**Low** — under the wall, trickier angle.',
              '**High** — up and over, but the keeper has more time.',
              '',
              '⏱️ 15 seconds to shoot!',
            ].join('\n')
          )
          .setFooter({ text: 'GoalX Mini Games · Free Kick  |  Step 2 of 2' })
          .setTimestamp();

        await interaction.editReply({
          embeds: [step2Embed],
          components: [heightButtons()],
        });

        const htCollector = msg.createMessageComponentCollector({
          filter: (i) =>
            i.user.id === interaction.user.id && i.customId.startsWith('fk_ht_'),
          time: 15_000,
          max: 1,
        });

        htCollector.on('collect', async (htBtn) => {
          await htBtn.deferUpdate().catch(() => {});
          const chosenHeight = htBtn.customId.replace('fk_ht_', '');

          const { scored, reason, keeperDive } = resolveOutcome(chosenDir, chosenHeight);

          if (scored) {
            await user.addCoins(bet);
          } else {
            await user.deductCoins(bet);
          }

          // Visual: wall row + net row
          const wallRow = DIRS.map((d) =>
            d === 'center' ? '🧱' : '　'
          ).join(' ');
          const keeperRow = DIRS.map((d) =>
            d === keeperDive ? '🧤' : '　'
          ).join(' ');
          const ballRow = DIRS.map((d) =>
            d === chosenDir ? (scored ? '⚽' : '💨') : '　'
          ).join(' ');

          const grid = [
            `\`  ${ballRow}  \`  ← Your shot (${HEIGHT_LABEL[chosenHeight]})`,
            `\`  ${wallRow}  \`  ← Wall`,
            `\`  ${keeperRow}  \`  ← Keeper`,
          ].join('\n');

          const resultEmbed = new EmbedBuilder()
            .setColor(scored ? '#44FF88' : '#FF4444')
            .setTitle(scored ? '⚽  FREE KICK GOAL!' : '🚫  No Goal')
            .setDescription(
              [
                grid,
                '',
                `*${reason}*`,
                '',
                scored
                  ? `🎉 You won **+${bet} coins**!`
                  : `💸 You lost **−${bet} coins**.`,
                `🪙 New balance: **${user.coins} coins**`,
              ].join('\n')
            )
            .setFooter({ text: 'GoalX Mini Games · Free Kick' })
            .setTimestamp();

          await interaction.editReply({
            embeds: [resultEmbed],
            components: [
              dirButtons(true),
              heightButtons(true),
            ],
          });
        });

        htCollector.on('end', async (collected) => {
          if (collected.size === 0) {
            await interaction
              .editReply({
                embeds: [
                  EmbedFactory.error(
                    'Time Up! ⏱️',
                    'You took too long to shoot — no coins lost.'
                  ),
                ],
                components: [dirButtons(true), heightButtons(true)],
              })
              .catch(() => {});
          }
        });
      });

      dirCollector.on('end', async (collected) => {
        if (collected.size === 0) {
          await interaction
            .editReply({
              embeds: [
                EmbedFactory.error(
                  'Time Up! ⏱️',
                  'You took too long to pick a direction — no coins lost.'
                ),
              ],
              components: [dirButtons(true)],
            })
            .catch(() => {});
        }
      });
    } catch (error) {
      const expired = error.code === 10062;
      if (!expired) logger.error('[freekick] execute error:', error);
      try {
        const msg = {
          embeds: [EmbedFactory.error('Error', error.message || 'Something went wrong.')],
          flags: 64,
        };
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else if (!expired) await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
