'use strict';

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const Club  = require('../../models/Club');
const User  = require('../../models/User');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('club')
    .setDescription('🏟️ Create and manage your GoalX club')
    .addSubcommand((sub) =>
      sub.setName('create')
        .setDescription('🏟️ Create a new club')
        .addStringOption((o) =>
          o.setName('name').setDescription('🏟️ Club name (max 32 chars)').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('tag').setDescription('🏟️ Club tag 2–5 letters, e.g. MCI').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('description').setDescription('🏟️ Short club description').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('join')
        .setDescription('🏟️ Join an existing club')
        .addStringOption((o) =>
          o.setName('name').setDescription('🏟️ Exact club name to join').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('info')
        .setDescription('🏟️ View info about a club')
        .addStringOption((o) =>
          o.setName('name').setDescription('🏟️ Club name (leave blank for your own club)').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('leave')
        .setDescription('🏟️ Leave your current club')
    )
    .addSubcommand((sub) =>
      sub.setName('kick')
        .setDescription('🏟️ Kick a member from your club (owner only)')
        .addUserOption((o) =>
          o.setName('member').setDescription('🏟️ Member to kick').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list')
        .setDescription('🏟️ List all clubs in this server')
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
        const name = interaction.options.getString('name').trim();
        const tag  = interaction.options.getString('tag').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const desc = interaction.options.getString('description') || '';

        if (name.length < 2 || name.length > 32) {
                    const helpRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('help:club')
              .setLabel('❓ Help')
              .setStyle(ButtonStyle.Secondary)
          );

          return interaction.editReply({ embeds: [EmbedFactory.error('Club name must be 2–32 characters.')] ,
            components: [helpRow]});
        }
        if (tag.length < 2 || tag.length > 5) {
          return interaction.editReply({ embeds: [EmbedFactory.error('Club tag must be 2–5 letters/numbers (e.g. MCI, MUFC).')] });
        }

        // Check user already in a club
        const existing = await Club.findOne({ guildId, 'members.userId': userId });
        if (existing) {
          return interaction.editReply({ embeds: [EmbedFactory.error(`You're already in **[${existing.tag}] ${existing.name}**. Leave first with \`/club leave\`.`)] });
        }

        try {
          const club = await Club.create({
            guildId,
            name,
            tag,
            description: desc,
            ownerId: userId,
            members: [{ userId, username, role: 'owner' }],
          });

          const embed = new EmbedBuilder()
            .setColor('#00D4FF')
            .setTitle(`🏟️ Club Created — [${club.tag}] ${club.name}`)
            .setDescription(desc || '*No description set.*')
            .addFields(
              { name: '🏟️ Owner', value: `<@${userId}>`, inline: true },
              { name: '🏟️ Members', value: '1', inline: true },
              { name: '🏟️ Level', value: '1', inline: true },
            )
            .setFooter({ text: 'GoalX Clubs · Invite friends with /club join' })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          if (err.code === 11000) {
            return interaction.editReply({ embeds: [EmbedFactory.error('A club with that **name** or **tag** already exists in this server. Pick a different one.')] });
          }
          throw err;
        }
      }

      // ── JOIN ────────────────────────────────────────────────────────────────
      if (sub === 'join') {
        const name = interaction.options.getString('name').trim();

        const alreadyIn = await Club.findOne({ guildId, 'members.userId': userId });
        if (alreadyIn) {
          return interaction.editReply({ embeds: [EmbedFactory.error(`You're already in **[${alreadyIn.tag}] ${alreadyIn.name}**. Leave first with \`/club leave\`.`)] });
        }

        const club = await Club.findOne({ guildId, name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (!club) {
          return interaction.editReply({ embeds: [EmbedFactory.error(`No club named **"${name}"** found in this server.`)] });
        }

        if (club.members.length >= 30) {
          return interaction.editReply({ embeds: [EmbedFactory.error(`**[${club.tag}] ${club.name}** is full (30/30 members).`)] });
        }

        club.members.push({ userId, username, role: 'member' });
        await club.save();

        const embed = new EmbedBuilder()
          .setColor('#44FF88')
          .setTitle(`✅ Joined [${club.tag}] ${club.name}`)
          .setDescription(`Welcome to the club, <@${userId}>! You're member **#${club.members.length}**.`)
          .addFields(
            { name: '🏟️ Owner', value: `<@${club.ownerId}>`, inline: true },
            { name: '🏟️ Members', value: `${club.members.length}/30`, inline: true },
            { name: '🏟️ Level', value: `${club.level}`, inline: true },
          )
          .setFooter({ text: 'GoalX Clubs' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // ── INFO ────────────────────────────────────────────────────────────────
      if (sub === 'info') {
        const nameArg = interaction.options.getString('name');
        let club;

        if (nameArg) {
          club = await Club.findOne({ guildId, name: { $regex: new RegExp(`^${nameArg}$`, 'i') } });
        } else {
          club = await Club.findOne({ guildId, 'members.userId': userId });
        }

        if (!club) {
          const msg = nameArg
            ? `No club named **"${nameArg}"** found.`
            : `You're not in a club. Create one with \`/club create\` or join one with \`/club join\`.`;
          return interaction.editReply({ embeds: [EmbedFactory.error(msg)] });
        }

        const topMembers = club.members.slice(0, 10).map((m) => `<@${m.userId}> ${m.role === 'owner' ? '👑' : ''}`).join('\n') || 'None';

        const embed = new EmbedBuilder()
          .setColor('#00D4FF')
          .setTitle(`🏟️ [${club.tag}] ${club.name}`)
          .setDescription(club.description || '*No description.*')
          .addFields(
            { name: '🏟️ Owner', value: `<@${club.ownerId}>`, inline: true },
            { name: '🏟️ Members', value: `${club.members.length}/30`, inline: true },
            { name: '🏟️ Level', value: `${club.level}`, inline: true },
            { name: '🏟️ Wins', value: `${club.wins}`, inline: true },
            { name: '🏟️ Losses', value: `${club.losses}`, inline: true },
            { name: '🏟️ XP', value: `${club.xp}`, inline: true },
            { name: `👥 Members (top ${Math.min(club.members.length, 10)})`, value: topMembers },
          )
          .setFooter({ text: 'GoalX Clubs' })
          .setTimestamp(club.createdAt);

        return interaction.editReply({ embeds: [embed] });
      }

      // ── LEAVE ───────────────────────────────────────────────────────────────
      if (sub === 'leave') {
        const club = await Club.findOne({ guildId, 'members.userId': userId });
        if (!club) {
          return interaction.editReply({ embeds: [EmbedFactory.error("You're not in any club.")] });
        }

        if (club.ownerId === userId) {
          if (club.members.length > 1) {
            return interaction.editReply({ embeds: [EmbedFactory.error("You're the **owner** — transfer ownership or disband the club before leaving. (Contact an admin to disband.)")] });
          }
          // Owner leaving a solo club — delete it
          await Club.deleteOne({ _id: club._id });
          return interaction.editReply({ embeds: [EmbedFactory.success(`🏚️ **[${club.tag}] ${club.name}** has been disbanded since you were the only member.`)] });
        }

        club.members = club.members.filter((m) => m.userId !== userId);
        await club.save();

        return interaction.editReply({ embeds: [EmbedFactory.success(`You've left **[${club.tag}] ${club.name}**.`)] });
      }

      // ── KICK ────────────────────────────────────────────────────────────────
      if (sub === 'kick') {
        const target = interaction.options.getUser('member');

        if (target.id === userId) {
          return interaction.editReply({ embeds: [EmbedFactory.error("You can't kick yourself. Use `/club leave` instead.")] });
        }

        const club = await Club.findOne({ guildId, 'members.userId': userId });
        if (!club) {
          return interaction.editReply({ embeds: [EmbedFactory.error("You're not in any club.")] });
        }
        if (club.ownerId !== userId) {
          return interaction.editReply({ embeds: [EmbedFactory.error("Only the club **owner** can kick members.")] });
        }

        const memberEntry = club.members.find((m) => m.userId === target.id);
        if (!memberEntry) {
          return interaction.editReply({ embeds: [EmbedFactory.error(`**${target.username}** is not in your club.`)] });
        }
        if (memberEntry.role === 'owner') {
          return interaction.editReply({ embeds: [EmbedFactory.error("You can't kick another owner.")] });
        }

        club.members = club.members.filter((m) => m.userId !== target.id);
        await club.save();

        const embed = new EmbedBuilder()
          .setColor('#FFB344')
          .setTitle(`👢 Member Kicked — [${club.tag}] ${club.name}`)
          .setDescription(`**${target.username}** has been removed from the club.`)
          .addFields({ name: '🏟️ Members remaining', value: `${club.members.length}/30`, inline: true })
          .setFooter({ text: 'GoalX Clubs' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // ── LIST ─────────────────────────────────────────────────────────────────
      if (sub === 'list') {
        const clubs = await Club.find({ guildId }).sort({ level: -1, xp: -1 }).limit(10);
        if (!clubs.length) {
          return interaction.editReply({ embeds: [EmbedFactory.error('No clubs exist in this server yet. Be the first with `/club create`!')] });
        }

        const rows = clubs.map((c, i) =>
          `**${i + 1}.** [${c.tag}] ${c.name} — ${c.members.length} members · Lvl ${c.level} · ${c.wins}W/${c.losses}L`
        ).join('\n');

        const embed = new EmbedBuilder()
          .setColor('#00D4FF')
          .setTitle('🏟️ GoalX Clubs — This Server')
          .setDescription(rows)
          .setFooter({ text: 'GoalX Clubs · /club join <name> to join one' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
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
