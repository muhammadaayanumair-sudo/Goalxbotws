'use strict';

const { SlashCommandBuilder, EmbedBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins }  = require('../../utils/formatters');
const Tournament = require('../../models/Tournament');
const User       = require('../../models/User');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournament')
    .setDescription('🏆 Create and join GoalX tournaments')
    .addSubcommand((sub) =>
      sub.setName('create')
        .setDescription('🏆 Create a new tournament')
        .addStringOption((o) =>
          o.setName('name').setDescription('🏆 Tournament name (max 48 chars)').setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName('size')
            .setDescription('🏆 Max players: 4, 8, or 16')
            .setRequired(true)
            .addChoices(
              { name: '🏆 4 players', value: 4 },
              { name: '🏆 8 players', value: 8 },
              { name: '🏆 16 players', value: 16 },
            )
        )
        .addIntegerOption((o) =>
          o.setName('entry_fee')
            .setDescription('🏆 GoalCoins entry fee (0 = free)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(50000)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('join')
        .setDescription('🏆 Join an open tournament')
        .addStringOption((o) =>
          o.setName('name').setDescription('🏆 Tournament name to join').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('info')
        .setDescription('🏆 View details of a tournament')
        .addStringOption((o) =>
          o.setName('name').setDescription('🏆 Tournament name').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('start')
        .setDescription('🏆 Manually start a tournament and reveal the bracket (creator only)')
        .addStringOption((o) =>
          o.setName('name').setDescription('🏆 Tournament name to start').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list')
        .setDescription('🏆 List open tournaments in this server')
    ),

  cooldown: 5,

  async execute(interaction) {
  try {
      await interaction.deferReply();

      const sub      = interaction.options.getSubcommand();
      const userId   = interaction.user.id;
      const username = interaction.user.username;
      const guildId  = interaction.guildId;

      // ── CREATE ──────────────────────────────────────────────────────────────
      if (sub === 'create') {
        const name      = interaction.options.getString('name').trim();
        const size      = interaction.options.getInteger('size');
        const entryFee  = interaction.options.getInteger('entry_fee') ?? 0;

        if (name.length < 3) {
                    const helpRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('help:tournament')
              .setLabel('❓ Help')
              .setStyle(ButtonStyle.Secondary)
          );

          return interaction.editReply({ embeds: [EmbedFactory.error('Tournament name must be at least 3 characters.')] ,
            components: [helpRow]});
        }

        // Check for existing open tournament with same name in this guild
        const dupe = await Tournament.findOne({ guildId, name: { $regex: new RegExp(`^${name}$`, 'i') }, status: 'open' });
        if (dupe) {
          return interaction.editReply({ embeds: [EmbedFactory.error(`A tournament called **"${name}"** is already open. Pick a different name.`)] });
        }

        // Deduct entry fee from creator
        let user = null;
        if (entryFee > 0) {
          user = await User.findOne({ userId });
          if (!user || user.coins < entryFee) {
            return interaction.editReply({ embeds: [EmbedFactory.error(`You need **${formatCoins(entryFee)}** to enter. You only have **${formatCoins(user?.coins ?? 0)}**.`)] });
          }
          user.coins -= entryFee;
          user.totalSpent += entryFee;
          await user.save();
        }

        const tournament = await Tournament.create({
          guildId,
          name,
          creatorId: userId,
          maxPlayers: size,
          entryFee,
          prizePool: entryFee,
          participants: [{ userId, username }],
        });

        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle(`🏆 Tournament Created — ${tournament.name}`)
          .addFields(
            { name: '🏆 Size',       value: `${size} players`,                   inline: true },
            { name: '🏆 Entry Fee',  value: formatCoins(entryFee),               inline: true },
            { name: '🏆 Prize Pool', value: formatCoins(tournament.prizePool),   inline: true },
            { name: '🏆 Registered', value: `1/${size}`,                          inline: true },
            { name: '🏆 Status',     value: '🟢 Open',                            inline: true },
            { name: '🏆 How to Join', value: `\`/tournament join ${name}\`` },
          )
          .setFooter({ text: 'GoalX Tournaments · Tournament starts when full' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // ── JOIN ────────────────────────────────────────────────────────────────
      if (sub === 'join') {
        const name = interaction.options.getString('name').trim();

        const tournament = await Tournament.findOne({
          guildId,
          name: { $regex: new RegExp(`^${name}$`, 'i') },
          status: 'open',
        });

        if (!tournament) {
          return interaction.editReply({ embeds: [EmbedFactory.error(`No open tournament named **"${name}"** found. Check \`/tournament list\`.`)] });
        }

        if (tournament.hasParticipant(userId)) {
          return interaction.editReply({ embeds: [EmbedFactory.error("You've already joined this tournament!")] });
        }

        if (tournament.isFull()) {
          return interaction.editReply({ embeds: [EmbedFactory.error(`**${tournament.name}** is already full (${tournament.maxPlayers}/${tournament.maxPlayers}).`)] });
        }

        // Deduct entry fee
        if (tournament.entryFee > 0) {
          const user = await User.findOne({ userId });
          if (!user || user.coins < tournament.entryFee) {
            return interaction.editReply({ embeds: [EmbedFactory.error(`You need **${formatCoins(tournament.entryFee)}** to enter. You only have **${formatCoins(user?.coins ?? 0)}**.`)] });
          }
          user.coins -= tournament.entryFee;
          user.totalSpent += tournament.entryFee;
          await user.save();

          tournament.prizePool += tournament.entryFee;
        }

        tournament.participants.push({ userId, username });

        // Auto-start when full
        const nowFull = tournament.participants.length >= tournament.maxPlayers;
        if (nowFull) {
          tournament.status      = 'in_progress';
          tournament.startedAt   = new Date();
        }

        await tournament.save();

        const spotsLeft = tournament.maxPlayers - tournament.participants.length;

        const embed = new EmbedBuilder()
          .setColor(nowFull ? '#FF4444' : '#44FF88')
          .setTitle(`${nowFull ? '🚀 Tournament Full — Starting!' : '✅ Joined'} ${tournament.name}`)
          .setDescription(
            nowFull
              ? `All **${tournament.maxPlayers}** spots are filled. The tournament is now **In Progress**! Use \`/kickoff\` to battle opponents.`
              : `<@${userId}> has joined! **${spotsLeft}** spot${spotsLeft !== 1 ? 's' : ''} remaining.`
          )
          .addFields(
            { name: '🏆 Players', value: `${tournament.participants.length}/${tournament.maxPlayers}`, inline: true },
            { name: '🏆 Prize Pool', value: formatCoins(tournament.prizePool), inline: true },
            { name: '🏆 Status', value: nowFull ? '🔴 In Progress' : '🟢 Open', inline: true },
          )
          .setFooter({ text: 'GoalX Tournaments' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // ── INFO ────────────────────────────────────────────────────────────────
      if (sub === 'info') {
        const name = interaction.options.getString('name').trim();
        const tournament = await Tournament.findOne({
          guildId,
          name: { $regex: new RegExp(`^${name}$`, 'i') },
        }).sort({ createdAt: -1 });

        if (!tournament) {
          return interaction.editReply({ embeds: [EmbedFactory.error(`No tournament named **"${name}"** found.`)] });
        }

        const statusEmoji = { open: '🟢 Open', in_progress: '🔴 In Progress', completed: '🏁 Completed' };
        const playerList  = tournament.participants
          .map((p, i) => `${i + 1}. <@${p.userId}>`)
          .join('\n') || 'None yet';

        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle(`🏆 ${tournament.name}`)
          .addFields(
            { name: '🏆 Status',     value: statusEmoji[tournament.status] ?? tournament.status, inline: true },
            { name: '🏆 Size',       value: `${tournament.maxPlayers} players`,                  inline: true },
            { name: '🏆 Entry Fee',  value: formatCoins(tournament.entryFee),                    inline: true },
            { name: '🏆 Prize Pool', value: formatCoins(tournament.prizePool),                   inline: true },
            { name: '🏆 Created by', value: `<@${tournament.creatorId}>`,                        inline: true },
            { name: '🏆 Participants', value: playerList },
          )
          .setFooter({ text: 'GoalX Tournaments' })
          .setTimestamp(tournament.createdAt);

        if (tournament.winnerId) {
          embed.addFields({ name: '🏆 Winner', value: `<@${tournament.winnerId}>` });
        }

        return interaction.editReply({ embeds: [embed] });
      }

      // ── START ────────────────────────────────────────────────────────────────
      if (sub === 'start') {
        const name = interaction.options.getString('name').trim();

        const tournament = await Tournament.findOne({
          guildId,
          name: { $regex: new RegExp(`^${name}$`, 'i') },
          status: 'open',
        });

        if (!tournament) {
          return interaction.editReply({ embeds: [EmbedFactory.error(`No open tournament named **"${name}"** found.`)] });
        }
        if (tournament.creatorId !== userId) {
          return interaction.editReply({ embeds: [EmbedFactory.error("Only the **tournament creator** can start it.")] });
        }
        if (tournament.participants.length < 2) {
          return interaction.editReply({ embeds: [EmbedFactory.error("Need at least **2 players** to start the tournament.")] });
        }

        // Generate random bracket — shuffle then pair up
        const shuffled = [...tournament.participants].sort(() => Math.random() - 0.5);
        const matches  = [];
        for (let i = 0; i < shuffled.length - 1; i += 2) {
          matches.push([shuffled[i], shuffled[i + 1]]);
        }
        // Odd player out gets a bye
        const bye = shuffled.length % 2 !== 0 ? shuffled[shuffled.length - 1] : null;

        tournament.status    = 'in_progress';
        tournament.startedAt = new Date();
        await tournament.save();

        const bracketLines = matches.map((pair, i) =>
          `**Match ${i + 1}:** <@${pair[0].userId}> ⚔️ <@${pair[1].userId}>`
        );
        if (bye) bracketLines.push(`**Bye:** <@${bye.userId}> advances automatically`);

        const prizeBreakdown = tournament.prizePool > 0
          ? `\n\n🥇 **Winner takes ${formatCoins(tournament.prizePool)}!**`
          : '';

        const embed = new EmbedBuilder()
          .setColor('#FF6B00')
          .setTitle(`🚀 Tournament Started — ${tournament.name}`)
          .setDescription(
            `The bracket is set! Play your matches with \`/kickoff @opponent\` and report results.\n\n` +
            bracketLines.join('\n') +
            prizeBreakdown
          )
          .addFields(
            { name: '🏆 Players',    value: `${tournament.participants.length}`,    inline: true },
            { name: '🏆 Prize Pool', value: formatCoins(tournament.prizePool),       inline: true },
            { name: '🏆 Status',     value: '🔴 In Progress',                        inline: true },
          )
          .setFooter({ text: 'GoalX Tournaments · Use /kickoff to play your match' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // ── LIST ─────────────────────────────────────────────────────────────────
      if (sub === 'list') {
        const tournaments = await Tournament.find({ guildId, status: { $in: ['open', 'in_progress'] } })
          .sort({ createdAt: -1 })
          .limit(10);

        if (!tournaments.length) {
          return interaction.editReply({ embeds: [EmbedFactory.error('No open tournaments right now. Create one with `/tournament create`!')] });
        }

        const statusEmoji = { open: '🟢', in_progress: '🔴', completed: '🏁' };

        const rows = tournaments.map((t, i) => {
          const spots = `${t.participants.length}/${t.maxPlayers}`;
          const fee   = t.entryFee > 0 ? ` · ${formatCoins(t.entryFee)} entry` : ' · Free';
          return `**${i + 1}.** ${statusEmoji[t.status]} **${t.name}** — ${spots}${fee}`;
        }).join('\n');

        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🏆 GoalX Tournaments — This Server')
          .setDescription(rows)
          .setFooter({ text: 'GoalX Tournaments · /tournament join <name> to enter' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }
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
