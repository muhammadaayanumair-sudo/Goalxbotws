'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins, formatNumber } = require('../../utils/formatters');
const { Contract, getDailyPool } = require('../../models/Contract');
const User = require('../../models/User');
const { AchievementService } = require('../../services/AchievementService');
const { logger } = require('../../utils/logger');

const POS_EMOJI = { Goalkeeper: '🧤', Defender: '🛡️', Midfielder: '⚙️', Attacker: '⚽' };
const MAX_CONTRACTS = 5;

function contractLine(c) {
  const daysLeft = Math.max(0, Math.ceil((new Date(c.endDate) - Date.now()) / 86_400_000));
  const netDaily = c.dailyRevenue - c.dailySalary;
  return `${POS_EMOJI[c.position] || '👤'} **${c.playerName}** (OVR ${c.overall})\n` +
    `  💵 Net: +${formatCoins(netDaily)}/day · ⏳ ${daysLeft}d remaining`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('contract')
    .setDescription('📄 Manage player contracts and earn daily revenue')

    .addSubcommand((s) => s
      .setName('list')
      .setDescription('📄 View all your active player contracts'))

    .addSubcommand((s) => s
      .setName('browse')
      .setDescription('👀 View today\'s available players to sign a contract'))

    .addSubcommand((s) => s
      .setName('sign')
      .setDescription('✍️ Sign a contract with a player from today\'s available list')
      .addIntegerOption((o) => o
        .setName('player')
        .setDescription('📄 Player number from the available list (1–5)')
        .setMinValue(1).setMaxValue(5).setRequired(true))
      .addIntegerOption((o) => o
        .setName('duration')
        .setDescription('📄 Contract length in days')
        .setRequired(true)
        .addChoices(
          { name: '📄 7 days', value: 7 },
          { name: '📄 14 days', value: 14 },
          { name: '📄 30 days', value: 30 },
        )))

    .addSubcommand((s) => s
      .setName('revenue')
      .setDescription('📄 Collect accumulated revenue from all active contracts'))

    .addSubcommand((s) => s
      .setName('relief')
      .setDescription('📄 Release a player from their contract (50% signing fee refund)')
      .addIntegerOption((o) => o
        .setName('slot')
        .setDescription('📄 Contract slot number (see /contract list)')
        .setMinValue(1).setMaxValue(MAX_CONTRACTS).setRequired(true))),

  cooldown: 5,

  async execute(interaction, client) {
    try {
      const sub    = interaction.options.getSubcommand();
      const userId = interaction.user.id;

      // ── /contract list ─────────────────────────────────────────────────────
      if (sub === 'list') {
        await interaction.deferReply();
        const contracts = await Contract.find({ userId, status: 'active' }).sort({ createdAt: 1 });

        // Auto-expire
        let changed = false;
        for (const c of contracts) {
          if (new Date() > c.endDate) { c.status = 'expired'; changed = true; await c.save(); }
        }
        const active = contracts.filter((c) => c.status === 'active');

        if (!active.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.base('📋 Your Contracts')
              .setDescription('You have no active contracts.\n\nBrowse today\'s available players with `/contract sign`.'),
            ],
          });
        }

        const pool = getDailyPool();
        const lines = active.map((c, i) => `**#${i + 1}** ${contractLine(c)}`);
        const totalNetDaily = active.reduce((s, c) => s + c.dailyRevenue - c.dailySalary, 0);

        const embed = EmbedFactory.base('📋 Active Contracts')
          .setDescription(lines.join('\n\n'))
          .addFields(
            { name: '📄 Combined Net Income', value: `${formatCoins(totalNetDaily)}/day`, inline: true },
            { name: '📄 Slots Used', value: `${active.length}/${MAX_CONTRACTS}`, inline: true },
          )
          .setFooter({ text: '⚽ Powered by GoalX · Use /contract revenue to collect · /contract relief to release' });

        return interaction.editReply({ embeds: [embed] });
      }

      // ── /contract browse ───────────────────────────────────────────────────
      if (sub === 'browse') {
        await interaction.deferReply();
        const pool = getDailyPool();

        const lines = pool.map((p, i) =>
          `**#${i + 1}** ${POS_EMOJI[p.position] || '👤'} **${p.name}** · ${p.position} · OVR **${p.overall}**\n` +
          `　💸 Signing Fee: ${formatCoins(p.signingFee)} · 📈 Revenue: ${formatCoins(p.dailyRevenue)}/day · 📉 Salary: ${formatCoins(p.dailySalary)}/day · 💵 Net: **+${formatCoins(p.dailyRevenue - p.dailySalary)}/day**`
        );

        const embed = EmbedFactory.base('📋 Today\'s Available Players')
          .setDescription(lines.join('\n\n'))
          .addFields({ name: '✍️ How to sign', value: 'Use `/contract sign player:<1–5> duration:<days>` to sign any of these players.', inline: false })
          .setFooter({ text: '🔄 Pool refreshes daily at midnight UTC' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('refresh:contract').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        );
        return interaction.editReply({ embeds: [embed], components: [row] });
      }

      // ── /contract sign ─────────────────────────────────────────────────────
      if (sub === 'sign') {
        await interaction.deferReply();
        const slot     = interaction.options.getInteger('player') - 1;
        const duration = interaction.options.getInteger('duration');
        const pool     = getDailyPool();
        const player   = pool[slot];

        const user = await User.findOneAndUpdate(
          { userId },
          { $setOnInsert: { userId, username: interaction.user.username } },
          { upsert: true, new: true }
        );

        const activeCount = await Contract.countDocuments({ userId, status: 'active' });
        if (activeCount >= MAX_CONTRACTS) {
          return interaction.editReply({
            embeds: [EmbedFactory.error('Contract Limit Reached', `You can hold a maximum of **${MAX_CONTRACTS} contracts** at once.\n\nUse \`/contract relief\` to release a player first.`)],
          });
        }

        // Check this player isn't already under contract
        const alreadySigned = await Contract.findOne({ userId, playerName: player.name, status: 'active' });
        if (alreadySigned) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('Already Signed', `You already have **${player.name}** under contract.\n\nWait for the contract to expire or use \`/contract relief\` to release them.`)],
          });
        }

        if (user.coins < player.signingFee) {
          return interaction.editReply({
            embeds: [EmbedFactory.error('Insufficient Funds', `Signing **${player.name}** requires a **${formatCoins(player.signingFee)}** signing fee.\n\nYou have ${formatCoins(user.coins)}.`)],
          });
        }

        const netDaily  = player.dailyRevenue - player.dailySalary;
        const totalNet  = netDaily * duration - player.signingFee;
        const breakeven = Math.ceil(player.signingFee / netDaily);

        // Confirm embed
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('contract_confirm').setLabel('Sign Contract').setEmoji('✍️').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('contract_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );

        const msg = await interaction.editReply({
          embeds: [EmbedFactory.base()
            .setColor('#27AE60')
            .setTitle(`✍️ Contract Offer — ${player.name}`)
            .setDescription([
              `${POS_EMOJI[player.position]} **${player.name}** · ${player.position} · OVR **${player.overall}**`,
              '',
              `📄 **Duration:** ${duration} days`,
              `💸 **Signing Fee:** ${formatCoins(player.signingFee)} *(one-time, paid now)*`,
              `📈 **Daily Revenue:** ${formatCoins(player.dailyRevenue)}`,
              `📉 **Daily Salary:** ${formatCoins(player.dailySalary)}`,
              `💵 **Net Daily Profit:** ${formatCoins(netDaily)}`,
              '',
              `📊 **Total Net Profit:** ${formatCoins(totalNet)} over ${duration} days`,
              `⏱️ **Breakeven:** ${breakeven} days`,
            ].join('\n')),
          ],
          components: [row],
        });

        const coll = msg.createMessageComponentCollector({ filter: (i) => i.user.id === userId, time: 30_000, max: 1 });
        coll.on('collect', async (btn) => {
          await btn.deferUpdate().catch(() => {});
          if (btn.customId === 'contract_cancel') {
            return interaction.editReply({ embeds: [EmbedFactory.base('Signing Cancelled')], components: [] });
          }

          const freshUser = await User.findOne({ userId });
          if (!freshUser.deductCoins(player.signingFee)) {
            return interaction.editReply({ embeds: [EmbedFactory.error('Insufficient Coins', 'Your balance changed — not enough to sign.')], components: [] });
          }

          const endDate = new Date(Date.now() + duration * 86_400_000);
          await Contract.create({
            userId, playerName: player.name, position: player.position,
            overall: player.overall, signingFee: player.signingFee,
            dailySalary: player.dailySalary, dailyRevenue: player.dailyRevenue,
            durationDays: duration, endDate,
          });

          freshUser.addXp(25);
          await freshUser.save();

          await interaction.editReply({
            embeds: [EmbedFactory.success('Contract Signed! ✍️', [
              `**${player.name}** is now under contract for **${duration} days**.`,
              `💸 Signing fee paid: ${formatCoins(player.signingFee)}`,
              `💵 You'll earn ${formatCoins(netDaily)}/day net.`,
              `💰 Remaining balance: ${formatCoins(freshUser.coins)}`,
              '',
              `Collect revenue with \`/contract revenue\`.`,
            ].join('\n'))],
            components: [],
          });
          await AchievementService.checkAndAward(userId);
        });
        coll.on('end', (collected) => {
          if (!collected.size) interaction.editReply({ components: [] }).catch(() => {});
        });
      }

      // ── /contract revenue ──────────────────────────────────────────────────
      else if (sub === 'revenue') {
        await interaction.deferReply();
        const contracts = await Contract.find({ userId, status: 'active' });

        if (!contracts.length) {
          return interaction.editReply({
            embeds: [EmbedFactory.base('💰 Contract Revenue')
              .setDescription('📄 You have no active contracts.\n\nSign players with `/contract sign`.'),
            ],
          });
        }

        const user = await User.findOneAndUpdate(
          { userId },
          { $setOnInsert: { userId, username: interaction.user.username } },
          { upsert: true, new: true }
        );

        let totalEarned = 0;
        const lines = [];
        for (const c of contracts) {
          if (new Date() > c.endDate) { c.status = 'expired'; await c.save(); continue; }
          const earned = c.pendingRevenue();
          if (earned > 0) {
            c.lastClaimed = new Date();
            await c.save();
            totalEarned += earned;
            lines.push(`${POS_EMOJI[c.position] || '👤'} **${c.playerName}** — +${formatCoins(earned)}`);
          } else {
            lines.push(`${POS_EMOJI[c.position] || '👤'} **${c.playerName}** — *nothing yet*`);
          }
        }

        if (totalEarned === 0) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('No Revenue Yet', 'Contracts need time to generate revenue.\n\nNet income accumulates daily — check back in a few hours!')],
          });
        }

        user.addCoins(totalEarned);
        user.addXp(Math.floor(totalEarned / 50));
        await user.save();

        await interaction.editReply({
          embeds: [EmbedFactory.success(`Contract Revenue Collected! 💰`, [
            lines.join('\n'),
            '',
            `**Total collected: ${formatCoins(totalEarned)}**`,
            `💰 New balance: ${formatCoins(user.coins)}`,
          ].join('\n'))],
        });
      }

      // ── /contract relief ───────────────────────────────────────────────────
      else if (sub === 'relief') {
        await interaction.deferReply();
        const slotNum  = interaction.options.getInteger('slot');
        const contracts = await Contract.find({ userId, status: 'active' }).sort({ createdAt: 1 });

        const active = contracts.filter((c) => c.status === 'active' && new Date() < c.endDate);
        if (!active.length) {
          return interaction.editReply({ embeds: [EmbedFactory.base('No Active Contracts').setDescription('📄 You have no contracts to release.')] });
        }

        const target = active[slotNum - 1];
        if (!target) {
          return interaction.editReply({
            embeds: [EmbedFactory.error('Invalid Slot', `Slot #${slotNum} not found. You have ${active.length} active contract(s). Use \`/contract list\` to check.`)],
          });
        }

        const refund = Math.floor(target.signingFee * 0.5);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('relief_confirm').setLabel(`Release & Receive ${formatCoins(refund)}`).setEmoji('✂️').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('relief_cancel').setLabel('Keep Contract').setStyle(ButtonStyle.Secondary),
        );

        const msg = await interaction.editReply({
          embeds: [EmbedFactory.base()
            .setColor('#E74C3C')
            .setTitle('✂️ Confirm Contract Relief')
            .setDescription([
              `Release **${target.playerName}** from their contract?`,
              '',
              `💸 Signing fee paid: ${formatCoins(target.signingFee)}`,
              `💰 Refund (50%): **${formatCoins(refund)}**`,
              `⚠️ You will lose all future revenue from this player.`,
            ].join('\n')),
          ],
          components: [row],
        });

        const coll = msg.createMessageComponentCollector({ filter: (i) => i.user.id === userId, time: 30_000, max: 1 });
        coll.on('collect', async (btn) => {
          await btn.deferUpdate().catch(() => {});
          if (btn.customId === 'relief_cancel') {
            return interaction.editReply({ embeds: [EmbedFactory.base('Kept Contract').setDescription(`**${target.playerName}** stays on your roster.`)], components: [] });
          }
          target.status = 'released';
          await target.save();

          const user = await User.findOneAndUpdate({ userId }, { $setOnInsert: { userId, username: interaction.user.username } }, { upsert: true, new: true });
          user.addCoins(refund);
          await user.save();

          await interaction.editReply({
            embeds: [EmbedFactory.success('Contract Released', [
              `**${target.playerName}** has been released.`,
              `💰 Refund received: ${formatCoins(refund)}`,
              `💰 New balance: ${formatCoins(user.coins)}`,
            ].join('\n'))],
            components: [],
          });
        });
        coll.on('end', (collected) => {
          if (!collected.size) interaction.editReply({ components: [] }).catch(() => {});
        });
      }

    } catch (error) {
      const expired = error.code === 10062;
      if (!expired) logger.error('[contract] execute error:', error);
      try {
        const msg = { embeds: [EmbedFactory.error('Something went wrong', error.message || 'Unexpected error.')], flags: 64 };
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else if (!expired) await interaction.reply(msg);
      } catch (_) {}
    }
  },
};
