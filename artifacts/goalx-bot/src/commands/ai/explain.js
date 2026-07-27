'use strict';

const { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('explain')
    .setDescription('💡 AI explains a football concept, rule, or competition')
    .addStringOption((opt) =>
      opt.setName('topic')
        .setDescription('Topic to explain (e.g. "offside rule", "Champions League format", "tiki-taka")')
        .setRequired(true)
        .setMaxLength(200)
    ),

  cooldown: 20,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const ai = client.aiRouter;
      const topic = interaction.options.getString('topic');

      try {
        const explanation = await ai.explain(topic);

        const embed = EmbedFactory.ai(`Explains: ${topic}`)
          .setDescription(explanation.slice(0, 4000));

                const helpRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('help:explain')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed] ,
          components: [helpRow]});
      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Error', err.message || 'Could not generate explanation.')],
        });
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
