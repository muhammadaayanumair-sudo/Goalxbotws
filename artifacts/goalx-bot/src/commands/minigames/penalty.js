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

const DIRS = ['left', 'center', 'right'];
const EMOJI = { left: '⬅️', center: '⬆️', right: '➡️' };
const LABEL = { left: 'Left', center: 'Centre', right: 'Right' };

function buildButtons(disabled = false, style = ButtonStyle.Primary) {
  return new ActionRowBuilder().addComponents(
    DIRS.map((d) =>
      new ButtonBuilder()
        .setCustomId(`pen_${d}`)
        .setLabel(LABEL[d])
        .setEmoji(EMOJI[d])
        .setStyle(style)
        .setDisabled(disabled)
    )
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('penalty')
    .setDescription('⚽ Step up and take a penalty kick! Pick your corner 🥅')
    .addIntegerOption((o) =>
      o
        .setName('bet')
        .setDescription('🪙 Coins to wager (default: 50, max: 2000)')
        .setMinValue(10)
        .setMaxValue(2000)
    ),

  cooldown: 30,

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const bet = interaction.options.getInteger('bet') ?? 50;
      const user = await EconomyService.getUser(
        interaction.user.id,
        interaction.user.username
      );

      if (user.coins < bet) {
        return interaction.editReply({
          embeds: [
            EmbedFactory.error(
              'Not Enough Coins',
              `You need **${bet} coins** to play but only have **${user.coins}**. Try a smaller bet or earn more with \`/daily\`.`
            ),
          ],
        });
      }

      const promptEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🥅  Penalty Shootout')
        .setDescription(
          [
            `**${interaction.user.username}** places the ball on the spot…`,
            '',
            `> 💰 Wager: **${bet} coins**`,
            `> 🪙 Balance: **${user.coins} coins**`,
            '',
            '**Where do you aim?**',
            'You have **15 seconds** before the referee blows the whistle.',
          ].join('\n')
        )
        .setFooter({ text: 'GoalX Mini Games · Penalty Shootout' })
        .setTimestamp();

      const msg = await interaction.editReply({
        embeds: [promptEmbed],
        components: [buildButtons()],
      });

      const collector = msg.createMessageComponentCollector({
        filter: (i) => i.user.id === interaction.user.id,
        time: 15_000,
        max: 1,
      });

      collector.on('collect', async (btn) => {
        await btn.deferUpdate().catch(() => {});

        const playerDir = btn.customId.replace('pen_', '');
        const keeperDir = DIRS[Math.floor(Math.random() * 3)];
        const scored = playerDir !== keeperDir;

        if (scored) {
          await user.addCoins(bet);
        } else {
          await user.deductCoins(bet);
        }

        // Visual grid: ⚽ = shot, 🧤 = dive, ▫️ = empty
        const grid = DIRS.map((d) => {
          const shot = d === playerDir;
          const dive = d === keeperDir;
          if (shot && dive) return scored ? `${EMOJI[d]}⚽` : `${EMOJI[d]}🧤`;
          if (shot) return `${EMOJI[d]}⚽`;
          if (dive) return `${EMOJI[d]}🧤`;
          return '▫️';
        }).join('   ');

        const resultEmbed = new EmbedBuilder()
          .setColor(scored ? '#44FF88' : '#FF4444')
          .setTitle(scored ? '⚽  GOAL!' : '🧤  SAVED!')
          .setDescription(
            [
              `**You shot:** ${EMOJI[playerDir]} ${LABEL[playerDir]}`,
              `**Keeper dived:** ${EMOJI[keeperDir]} ${LABEL[keeperDir]}`,
              '',
              `\`[ ${grid} ]\``,
              '',
              scored
                ? `🎉 You won **+${bet} coins**!`
                : `💸 You lost **−${bet} coins**.`,
              `🪙 New balance: **${user.coins} coins**`,
            ].join('\n')
          )
          .setFooter({ text: 'GoalX Mini Games · Penalty Shootout' })
          .setTimestamp();

        await interaction.editReply({
          embeds: [resultEmbed],
          components: [buildButtons(true, scored ? ButtonStyle.Success : ButtonStyle.Danger)],
        });
      });

      collector.on('end', async (collected) => {
        if (collected.size === 0) {
          await interaction
            .editReply({
              embeds: [
                EmbedFactory.error(
                  'Time Up!',
                  'You hesitated too long — the referee whistled. No penalty taken, no coins lost.'
                ),
              ],
              components: [buildButtons(true, ButtonStyle.Secondary)],
            })
            .catch(() => {});
        }
      });
    } catch (error) {
      const expired = error.code === 10062;
      if (!expired) logger.error('[penalty] execute error:', error);
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
