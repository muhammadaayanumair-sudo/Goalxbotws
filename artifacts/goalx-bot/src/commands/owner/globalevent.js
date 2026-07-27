'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const GlobalEvent = require('../../models/GlobalEvent');
const { logger } = require('../../utils/logger');

function isOwner(userId) {
  return userId === process.env.BOT_OWNER_ID;
}

const TYPE_LABELS = {
  double_xp: '⭐ Double XP',
  double_coins: '💰 Double Coins',
  double_rewards: '🎁 Double Rewards',
  sale: '🏷️ Shop Sale',
};

const TYPE_EMOJIS = {
  double_xp: '⭐',
  double_coins: '💰',
  double_rewards: '🎁',
  sale: '🏷️',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('globalevent')
    .setDescription('🌍 Owner: start or manage a global server event')
    .addSubcommand((sub) =>
      sub.setName('start')
        .setDescription('🌍 Start a new global event')
        .addStringOption((opt) =>
          opt.setName('type')
            .setDescription('🌍 Choose the event type')
            .setRequired(true)
            .addChoices(
              { name: '🌍 Double XP', value: 'double_xp' },
              { name: '🌍 Double Coins', value: 'double_coins' },
              { name: '🌍 Double Rewards', value: 'double_rewards' },
              { name: '🌍 Shop Sale', value: 'sale' }
            )
        )
        .addIntegerOption((opt) =>
          opt.setName('hours')
            .setDescription('🌍 Duration in hours (1-168)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(168)
        )
        .addStringOption((opt) =>
          opt.setName('title')
            .setDescription('🌍 Event title (max 100 chars)')
            .setRequired(true)
            .setMaxLength(100)
        )
        .addStringOption((opt) =>
          opt.setName('description')
            .setDescription('🌍 Optional event description (max 500 chars)')
            .setRequired(false)
            .setMaxLength(500)
        )
        .addNumberOption((opt) =>
          opt.setName('multiplier')
            .setDescription('🌍 Reward multiplier (default 2.0)')
            .setRequired(false)
            .setMinValue(1.1)
            .setMaxValue(5)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('status')
        .setDescription('🌍 Show currently active global event')
    )
    .addSubcommand((sub) =>
      sub.setName('end')
        .setDescription('🌍 End the active global event early')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  cooldown: 5,

  async execute(interaction) {
    try {
      if (!isOwner(interaction.user.id)) {
        return interaction.reply({
          embeds: [EmbedFactory.error('🚫 Unauthorized', 'Only the bot owner can use global events.')],
          ephemeral: true,
        });
      }

      const sub = interaction.options.getSubcommand();

      if (sub === 'start') {
        await interaction.deferReply({ ephemeral: true });

        const existing = await GlobalEvent.getActive();
        if (existing) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('⚠️ Event Already Active', `**${existing.title}** is already running until <t:${Math.floor(existing.endsAt.getTime() / 1000)}:R>.`)],
          });
        }

        const hours = interaction.options.getInteger('hours');
        const multiplier = interaction.options.getNumber('multiplier') || 2;
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description') || '';
        const type = interaction.options.getString('type');

        const endsAt = new Date(Date.now() + hours * 60 * 60 * 1000);

        await GlobalEvent.create({
          active: true,
          type,
          title,
          description,
          multiplier,
          startsAt: new Date(),
          endsAt,
          createdBy: interaction.user.id,
        });

        const typeLabel = TYPE_LABELS[type];
        const emoji = TYPE_EMOJIS[type];

        const embed = EmbedFactory.success('🌍 Global Event Started! 🎉')
          .setDescription(
            `${emoji} **${title}**\n` +
            `*${description || typeLabel}*\n\n` +
            `🔢 Multiplier: **${multiplier}×**\n` +
            `⏳ Ends: <t:${Math.floor(endsAt.getTime() / 1000)}:R>\n` +
            `📝 Use \`/globalevent status\` to check progress.`
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('globalevent:status')
            .setLabel('📊 Status')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('globalevent:end')
            .setLabel('🛑 End Early')
            .setStyle(ButtonStyle.Danger)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
        return;
      }

      if (sub === 'status') {
        return this._sendStatus(interaction);
      }

      if (sub === 'end') {
        await interaction.deferReply({ ephemeral: true });
        const event = await GlobalEvent.getActive();
        if (!event) {
          return interaction.editReply({
            embeds: [EmbedFactory.warning('⚠️ No Active Event', 'Nothing to end.')],
          });
        }

        await GlobalEvent.updateOne({ _id: event._id }, { active: false, endsAt: new Date() });
        return interaction.editReply({
          embeds: [EmbedFactory.success('🛑 Event Ended', `**${event.title}** has been ended early.`)],
        });
      }
    } catch (error) {
      logger.error(`[${interaction.commandName}] execute error:`, error);
      try {
        const msg = { embeds: [EmbedFactory.error('❌ Error', error.message || 'Unexpected error.')], ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
        else await interaction.reply(msg);
      } catch (_) {}
    }
  },

  async _sendStatus(interaction, isButton = false) {
    const event = await GlobalEvent.getActive();
    if (!event) {
      const reply = { embeds: [EmbedFactory.base('📭 No Active Event', 'There is no global event running right now.\n\nUse `/globalevent start` to create one.')], flags: 64 };
      return isButton ? interaction.update(reply) : interaction.reply(reply);
    }

    const typeLabel = TYPE_LABELS[event.type];
    const emoji = TYPE_EMOJIS[event.type];

    const embed = EmbedFactory.base('🌍 Active Global Event')
      .setDescription(
        `${emoji} **${event.title}**\n` +
        `*${event.description || typeLabel}*\n\n` +
        `🔢 Multiplier: **${event.multiplier}×**\n` +
        `⏳ Ends: <t:${Math.floor(event.endsAt.getTime() / 1000)}:R>`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('globalevent_status')
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('globalevent_end')
        .setLabel('🛑 End Early')
        .setStyle(ButtonStyle.Danger)
    );

    const reply = { embeds: [embed], components: [row], ephemeral: true };
    return isButton ? interaction.update(reply) : interaction.reply(reply);
  },

  async handleButton(interaction) {
    const [, action] = interaction.customId.split(':');

    if (action === 'status') {
      return this._sendStatus(interaction, true);
    }

    if (action === 'end') {
      await interaction.deferUpdate();
      const event = await GlobalEvent.getActive();
      if (!event) {
        return interaction.editReply({
          embeds: [EmbedFactory.warning('⚠️ No Active Event', 'Nothing to end.')],
          components: [],
        });
      }

      await GlobalEvent.updateOne({ _id: event._id }, { active: false, endsAt: new Date() });
      return interaction.editReply({
        embeds: [EmbedFactory.success('🛑 Event Ended', `**${event.title}** has been ended early.`)],
        components: [],
      });
    }
  },
};
