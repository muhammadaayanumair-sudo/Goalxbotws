'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const GuildWar = require('../../models/GuildWar');
const { logger } = require('../../utils/logger');

const WAR_DURATION_DAYS = 7;

function buildStatusEmbed(war) {
  const statusEmoji = {
    active: '⚔️',
    won: '🏆',
    lost: '💀',
    draw: '🤝',
  }[war.status] || '⚔️';

  return EmbedFactory.base('⚔️ Guild War Status')
    .setDescription(
      `**${war.guildName}** 🆚 **${war.opponentName}**\n\n` +
      `📊 Score: **${war.guildScore} - ${war.opponentScore}**\n` +
      `${statusEmoji} Status: **${war.status.toUpperCase()}**\n` +
      `🕐 Started: <t:${Math.floor(war.startDate.getTime() / 1000)}:R>\n` +
      `⏳ Ends: <t:${Math.floor(war.endDate.getTime() / 1000)}:R>`
    );
}

function buildStatusButtons(active) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('guildwar:status:refresh')
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('guildwar:leaderboard')
      .setLabel('🏆 Leaderboard')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('guildwar:declare')
      .setLabel('⚔️ Declare War')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(active)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guildwar')
    .setDescription('⚔️ Guild-vs-guild competition system')
    .addSubcommand((sub) =>
      sub.setName('declare')
        .setDescription('⚔️ Challenge another server to a guild war')
        .addStringOption((opt) =>
          opt.setName('opponent')
            .setDescription('⚔️ Opponent guild ID or name')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('status')
        .setDescription('⚔️ View current guild war status')
    )
    .addSubcommand((sub) =>
      sub.setName('leaderboard')
        .setDescription('⚔️ View guild war leaderboard')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  cooldown: 10,

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;
      const guildName = interaction.guild?.name || 'Unknown';

      if (sub === 'declare') {
        const opponentInput = interaction.options.getString('opponent').trim();

        const existing = await GuildWar.getActiveForGuild(guildId);
        if (existing) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('⚠️ War Already Active', `Your guild is already in a war vs **${existing.opponentName}**.`)],
          });
        }

        const endDate = new Date(Date.now() + WAR_DURATION_DAYS * 24 * 60 * 60 * 1000);

        await GuildWar.create({
          guildId,
          opponentId: opponentInput,
          guildName,
          opponentName: opponentInput,
          status: 'active',
          startDate: new Date(),
          endDate,
        });

        const embed = EmbedFactory.success('⚔️ Guild War Declared! 🎉')
          .setDescription(
            `**${guildName}** has challenged **${opponentInput}**!\n\n` +
            `🕐 Duration: **${WAR_DURATION_DAYS} days**\n` +
            `⏳ Ends: <t:${Math.floor(endDate.getTime() / 1000)}:R>\n\n` +
            `📈 Score points by winning bets and completing daily challenges. Use \`/guildwar status\` to track the war.`
          );

        const row = buildStatusButtons(true);
        return interaction.editReply({ embeds: [embed], components: [row] });
      }

      if (sub === 'status') {
        const war = await GuildWar.getActiveForGuild(guildId) ||
          await GuildWar.findOne({ guildId }).sort({ createdAt: -1 }).lean();

        if (!war) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('guildwar:declare')
              .setLabel('⚔️ Declare War')
              .setStyle(ButtonStyle.Danger)
          );
          return interaction.editReply({
            embeds: [EmbedFactory.base('📭 No Wars', 'Your guild has not declared any wars yet.\n\nClick below to declare one!')],
            components: [row],
          });
        }

        const active = war.status === 'active' && new Date() <= war.endDate;
        return interaction.editReply({
          embeds: [buildStatusEmbed(war)],
          components: [buildStatusButtons(active)],
        });
      }

      if (sub === 'leaderboard') {
        return this._sendLeaderboard(interaction);
      }
    } catch (error) {
      logger.error(`[${interaction.commandName}] execute error:`, error);
      try {
        const msg = { embeds: [EmbedFactory.error('❌ Error', error.message || 'Unexpected error.')] };
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else await interaction.reply(msg);
      } catch (_) {}
    }
  },

  async handleButton(interaction) {
    const [, action] = interaction.customId.split(':');

    if (action === 'status' || action === 'refresh') {
      await interaction.deferUpdate();
      const guildId = interaction.guildId;
      const war = await GuildWar.getActiveForGuild(guildId) ||
        await GuildWar.findOne({ guildId }).sort({ createdAt: -1 }).lean();

      if (!war) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('guildwar:declare')
            .setLabel('⚔️ Declare War')
            .setStyle(ButtonStyle.Danger)
        );
        return interaction.editReply({
          embeds: [EmbedFactory.base('📭 No Wars', 'Your guild has not declared any wars yet.\n\nClick below to declare one!')],
          components: [row],
        });
      }

      const active = war.status === 'active' && new Date() <= war.endDate;
      return interaction.editReply({
        embeds: [buildStatusEmbed(war)],
        components: [buildStatusButtons(active)],
      });
    }

    if (action === 'leaderboard') {
      await interaction.deferUpdate();
      return this._sendLeaderboard(interaction);
    }

    if (action === 'declare') {
      return interaction.reply({
        embeds: [EmbedFactory.base('⚔️ Declare War', 'Use `/guildwar declare opponent:<guild name/id>` to start a war.')],
        flags: 64,
      });
    }
  },

  async _sendLeaderboard(interaction) {
    const isButton = interaction.isButton();
    const leaderboard = await GuildWar.getLeaderboard(10);
    if (!leaderboard.length) {
      const reply = {
        embeds: [EmbedFactory.base('📭 No Wars Yet', 'Guild war leaderboard is empty. Start a war with `/guildwar declare`!')],
      };
      return isButton ? interaction.editReply(reply) : interaction.editReply(reply);
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = leaderboard.map((g, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      return `${medal} **${g.name || 'Unknown'}** — ${g.wins}W ${g.losses}L · ${g.totalScore} pts`;
    });

    const embed = EmbedFactory.base('🏆 Guild War Leaderboard')
      .setDescription(lines.join('\n'));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('guildwar:status:refresh')
        .setLabel('📊 War Status')
        .setStyle(ButtonStyle.Primary)
    );

    const reply = { embeds: [embed], components: [row] };
    return isButton ? interaction.editReply(reply) : interaction.editReply(reply);
  },
};
