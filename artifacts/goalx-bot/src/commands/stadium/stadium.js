'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins, formatNumber, progressBar } = require('../../utils/formatters');
const { Stadium, LEVELS } = require('../../models/Stadium');
const User = require('../../models/User');
const { AchievementService } = require('../../services/AchievementService');
const { logger } = require('../../utils/logger');

const TIER_EMOJI = ['🏟️', '🏗️', '🏛️', '🌆', '🌟', '💎', '👑', '🔥', '⚡', '🏆'];

function buildStadiumEmbed(stadium, user, pending) {
  const lvl  = LEVELS[stadium.level - 1];
  const next = LEVELS[stadium.level] || null;
  const bar  = progressBar(stadium.level, 10, 12);

  let investLine = '';
  if (stadium.investmentAmount > 0) {
    const rate     = stadium.investReturnRate();
    const matured  = stadium.investmentMature();
    const payout   = Math.floor(stadium.investmentAmount * (1 + rate));
    investLine = matured
      ? `\n💹 **Investment ready!** ${formatCoins(payout)} waiting — use \`/stadium invest\` to collect`
      : `\n📈 **Active investment:** ${formatCoins(stadium.investmentAmount)} → ${formatCoins(payout)} (matures in 24h)`;
  }

  return EmbedFactory.base()
    .setColor('#1E88E5')
    .setTitle(`${TIER_EMOJI[stadium.level - 1]} **${stadium.name}**`)
    .setDescription([
      `**Level ${stadium.level}/10** — ${lvl.name}`,
      `\`${bar}\``,
      '',
      `🏟️ **Capacity:** ${formatNumber(lvl.capacity)} fans`,
      `💵 **Revenue Rate:** ${formatNumber(lvl.revenuePerHour)} coins/hour`,
      `⏱️ **Pending Revenue:** ${formatCoins(pending)} *(capped at 24h)*`,
      investLine,
      '',
      next
        ? `🔧 **Next Level:** ${next.name} — costs ${formatCoins(next.upgradeCost)}`
        : '🏆 **MAX LEVEL** — Your stadium is legendary!',
    ].join('\n'))
    .addFields(
      { name: '🏟️ Wallet',          value: formatCoins(user.coins),           inline: true },
      { name: '🏟️ Total Collected', value: formatCoins(stadium.totalCollected), inline: true },
    )
    .setFooter({ text: '⚽ Powered by GoalX · Collect regularly — revenue caps at 24 hours!' });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stadium')
    .setDescription('🏟️ Manage your personal football stadium')

    .addSubcommand((s) => s
      .setName('view')
      .setDescription('🏟️ View your stadium stats and collect pending revenue'))

    .addSubcommand((s) => s
      .setName('upgrade')
      .setDescription('🏟️ Spend coins to upgrade your stadium to the next level'))

    .addSubcommand((s) => s
      .setName('invest')
      .setDescription('🏟️ Invest coins into your stadium for a daily return (10%+ per day)')
      .addIntegerOption((o) => o
        .setName('amount')
        .setDescription('🏟️ Coins to invest (min 500) — or omit to collect a matured investment')
        .setMinValue(500)
        .setRequired(false)))

    .addSubcommand((s) => s
      .setName('rename')
      .setDescription('🏟️ Give your stadium a custom name')
      .addStringOption((o) => o
        .setName('name')
        .setDescription('🏟️ New stadium name (max 40 characters)')
        .setRequired(true)
        .setMaxLength(40))),

  cooldown: 5,

  async execute(interaction, client) {
    try {
      const sub    = interaction.options.getSubcommand();
      const userId = interaction.user.id;

      let [user, stadium] = await Promise.all([
        User.findOneAndUpdate({ userId }, { $setOnInsert: { userId, username: interaction.user.username } }, { upsert: true, new: true }),
        Stadium.findOneAndUpdate({ userId }, { $setOnInsert: { userId } }, { upsert: true, new: true }),
      ]);

      // ── /stadium view ─────────────────────────────────────────────────────
      if (sub === 'view') {
        await interaction.deferReply();
        const pending = stadium.pendingRevenue();
        const embed   = buildStadiumEmbed(stadium, user, pending);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('stadium_collect')
            .setLabel(pending > 0 ? `Collect ${formatCoins(pending)}` : 'Nothing to collect')
            .setEmoji('💰')
            .setStyle(ButtonStyle.Success)
            .setDisabled(pending < 1),
        );

        const msg = await interaction.editReply({ embeds: [embed], components: [row] });
        if (pending < 1) return;

        const coll = msg.createMessageComponentCollector({ filter: (i) => i.user.id === userId, time: 60_000, max: 1 });
        coll.on('collect', async (btn) => {
          await btn.deferUpdate().catch(() => {});
          const fresh    = await Stadium.findOne({ userId });
          const earned   = fresh.pendingRevenue();
          if (earned < 1) {
            return interaction.editReply({ embeds: [EmbedFactory.warning('Nothing to Collect', 'Revenue not yet accumulated.')], components: [] });
          }
          fresh.lastCollected  = new Date();
          fresh.totalCollected += earned;
          await fresh.save();
          user.addCoins(earned);
          user.addXp(5);
          await user.save();

          await interaction.editReply({
            embeds: [EmbedFactory.success('Revenue Collected! 💰', [
              `You collected **${formatCoins(earned)}** from **${fresh.name}**!`,
              `💰 New balance: ${formatCoins(user.coins)}`,
            ].join('\n'))],
            components: [],
          });
          await AchievementService.checkAndAward(userId);
        });
        coll.on('end', (collected) => {
          if (!collected.size) interaction.editReply({ components: [] }).catch(() => {});
        });
      }

      // ── /stadium upgrade ──────────────────────────────────────────────────
      else if (sub === 'upgrade') {
        await interaction.deferReply();
        const lvl  = LEVELS[stadium.level - 1];
        const next = LEVELS[stadium.level];

        if (!next) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('Max Level!', `**${stadium.name}** is already at Level 10 — the pinnacle of football venues!`)],
          });
        }
        if (user.coins < next.upgradeCost) {
          const need = next.upgradeCost - user.coins;
          return interaction.editReply({
            embeds: [EmbedFactory.error('Not Enough Coins',
              `Upgrading to Level ${stadium.level + 1} costs ${formatCoins(next.upgradeCost)}.\n` +
              `You have ${formatCoins(user.coins)} — you need **${formatCoins(need)} more**.`)],
          });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('upg_yes').setLabel(`Upgrade — ${formatCoins(next.upgradeCost)}`).setEmoji('🔧').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('upg_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );

        const msg = await interaction.editReply({
          embeds: [EmbedFactory.base()
            .setColor('#FF9800')
            .setTitle('🔧 Confirm Stadium Upgrade')
            .setDescription([
              `Upgrade **${stadium.name}** from Level ${stadium.level} to **Level ${stadium.level + 1}**`,
              '',
              `📋 New tier: **${next.name}**`,
              `🏟️ Capacity: ${formatNumber(lvl.capacity)} → **${formatNumber(next.capacity)}** fans`,
              `💵 Revenue: ${formatNumber(lvl.revenuePerHour)}/hr → **${formatNumber(next.revenuePerHour)}/hr**`,
              '',
              `💸 Cost: **${formatCoins(next.upgradeCost)}**  ·  Balance after: ${formatCoins(user.coins - next.upgradeCost)}`,
            ].join('\n')),
          ],
          components: [row],
        });

        const coll = msg.createMessageComponentCollector({ filter: (i) => i.user.id === userId, time: 30_000, max: 1 });
        coll.on('collect', async (btn) => {
          await btn.deferUpdate().catch(() => {});
          if (btn.customId === 'upg_no') {
            return interaction.editReply({ embeds: [EmbedFactory.base('Upgrade Cancelled')], components: [] });
          }
          const freshUser = await User.findOne({ userId });
          if (!freshUser.deductCoins(next.upgradeCost)) {
            return interaction.editReply({ embeds: [EmbedFactory.error('Insufficient Coins', 'Your balance changed — not enough coins.')], components: [] });
          }
          stadium.level += 1;
          freshUser.addXp(50);
          await Promise.all([freshUser.save(), stadium.save()]);
          const newLvl = LEVELS[stadium.level - 1];
          await interaction.editReply({
            embeds: [EmbedFactory.success(`${TIER_EMOJI[stadium.level - 1]} Stadium Upgraded!`, [
              `**${stadium.name}** is now a **${newLvl.name}** (Level ${stadium.level})!`,
              '',
              `🏟️ Capacity: **${formatNumber(newLvl.capacity)}** fans`,
              `💵 Revenue: **${formatNumber(newLvl.revenuePerHour)}** coins/hour`,
              `💰 Remaining balance: ${formatCoins(freshUser.coins)}`,
            ].join('\n'))],
            components: [],
          });
          await AchievementService.checkAndAward(userId);
        });
        coll.on('end', (collected) => {
          if (!collected.size) interaction.editReply({ components: [] }).catch(() => {});
        });
      }

      // ── /stadium invest ───────────────────────────────────────────────────
      else if (sub === 'invest') {
        await interaction.deferReply();
        const amount = interaction.options.getInteger('amount');

        // Collect a matured investment first (or if no amount specified)
        if (stadium.investmentAmount > 0 && stadium.investmentMature()) {
          const rate   = stadium.investReturnRate();
          const payout = Math.floor(stadium.investmentAmount * (1 + rate));
          const profit = payout - stadium.investmentAmount;
          stadium.investmentAmount = 0;
          stadium.investmentDate   = null;
          await stadium.save();
          user.addCoins(payout);
          user.addXp(20);
          await user.save();

          const collectedEmbed = EmbedFactory.success('Investment Collected! 📈', [
            `Your investment matured and returned **${formatCoins(payout)}**!`,
            `📊 Profit: **+${formatCoins(profit)}** (${((rate) * 100).toFixed(0)}% return)`,
            `💰 New balance: ${formatCoins(user.coins)}`,
            '',
            amount ? `Reinvesting ${formatCoins(amount)}…` : 'Use `/stadium invest <amount>` to reinvest.',
          ].join('\n'));

          if (!amount) {
            return interaction.editReply({ embeds: [collectedEmbed] });
          }
          await interaction.editReply({ embeds: [collectedEmbed] });
        } else if (!amount) {
          // No investment active and no amount given — show status
          return interaction.editReply({
            embeds: [EmbedFactory.base('📈 Investment Info')
              .setDescription([
                'Use `/stadium invest <amount>` to invest coins.',
                '',
                `📊 Your current return rate: **${((stadium.investReturnRate()) * 100).toFixed(0)}%/day** (base 10% + ${stadium.level - 1}% stadium bonus)`,
                `⏰ Lock-up period: **24 hours**`,
                '',
                stadium.investmentAmount > 0
                  ? `🔒 Active investment: ${formatCoins(stadium.investmentAmount)} — not yet matured`
                  : '✅ No active investment — ready to invest!',
              ].join('\n')),
            ],
          });
        }

        // New investment
        if (stadium.investmentAmount > 0) {
          const hoursSince = (Date.now() - new Date(stadium.investmentDate).getTime()) / 3_600_000;
          const remaining  = Math.ceil(24 - hoursSince);
          return interaction.editReply({
            embeds: [EmbedFactory.warning('Investment Active', [
              `You already have ${formatCoins(stadium.investmentAmount)} invested.`,
              `It matures in **${remaining}h** — collect it first before reinvesting.`,
            ].join('\n'))],
          });
        }

        const freshUser = await User.findOne({ userId });
        if (freshUser.coins < amount) {
          return interaction.editReply({
            embeds: [EmbedFactory.error('Insufficient Coins', `You need ${formatCoins(amount)} but only have ${formatCoins(freshUser.coins)}.`)],
          });
        }

        const rate   = stadium.investReturnRate();
        const payout = Math.floor(amount * (1 + rate));
        const profit = payout - amount;

        freshUser.deductCoins(amount);
        stadium.investmentAmount = amount;
        stadium.investmentDate   = new Date();
        await Promise.all([freshUser.save(), stadium.save()]);

        await interaction.editReply({
          embeds: [EmbedFactory.success('Investment Made! 📈', [
            `You invested **${formatCoins(amount)}** into **${stadium.name}**.`,
            '',
            `📊 Return rate: **${(rate * 100).toFixed(0)}%** (10% base + ${stadium.level - 1}% stadium bonus)`,
            `💰 Expected payout: **${formatCoins(payout)}** (+${formatCoins(profit)} profit)`,
            `⏰ Matures in: **24 hours**`,
            '',
            `Run \`/stadium invest\` (no amount) in 24h to collect.`,
          ].join('\n'))],
        });
      }

      // ── /stadium rename ───────────────────────────────────────────────────
      else if (sub === 'rename') {
        const newName   = interaction.options.getString('name').trim();
        stadium.name    = newName;
        await stadium.save();
        await interaction.reply({
          embeds: [EmbedFactory.success('Stadium Renamed! ✏️', `Your stadium is now **${newName}**.\n\nUse \`/stadium view\` to see it in action!`)],
          ephemeral: true,
        });
      }

    } catch (error) {
      const expired = error.code === 10062;
      if (!expired) logger.error('[stadium] execute error:', error);
      try {
        const msg = { embeds: [EmbedFactory.error('Something went wrong', error.message || 'An unexpected error occurred.')], flags: 64 };
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else if (!expired) await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
