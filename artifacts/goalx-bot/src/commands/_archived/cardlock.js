'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const Card = require('../../models/Card');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cardlock')
    .setDescription('Lock or unlock a card to protect it from being sold or traded')
    .addStringOption((opt) =>
      opt.setName('cardid').setDescription('Card ID (first 8 chars)').setRequired(true)
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const cardIdInput = interaction.options.getString('cardid');
      const card = await Card.findOne({ cardId: { $regex: `^${cardIdInput}` }, ownerId: interaction.user.id });

      if (!card) {
        return interaction.reply({ embeds: [EmbedFactory.error('Not Found', 'Card not found or not owned by you.')], ephemeral: true });
      }

      card.locked = !card.locked;
      await card.save();

      await interaction.reply({
        embeds: [
          card.locked
            ? EmbedFactory.success('Card Locked 🔒', `**${card.playerName}** is now locked and cannot be sold or traded.`)
            : EmbedFactory.success('Card Unlocked 🔓', `**${card.playerName}** is now unlocked and can be sold or traded.`),
        ],
        ephemeral: true,
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
