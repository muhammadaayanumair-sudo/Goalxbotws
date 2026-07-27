'use strict';

const { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { FootballApiManager } = require('../../services/FootballApiManager');
const { logger } = require('../../utils/logger');

/**
 * /bio - reuses the same player search data /player already fetches via
 * FootballApiManager (cached), then asks Groq for a short biography.
 * Results are cached 24h in AiService since career facts don't change hourly.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('bio')
    .setDescription('📝 AI writes a short biography of a player')
    .addStringOption((opt) => opt.setName('name').setDescription('📝 Player name').setRequired(true)),

  cooldown: 15,

  async execute(interaction, client) {
  try {
      await interaction.deferReply();
      const api = new FootballApiManager(client.cache);
      const ai = client.aiRouter;
      const playerName = interaction.options.getString('name');

      try {
        let profileData = null;
        try {
          const results = await api.searchPlayer(playerName);
          if (results?.length) {
            const player = results[0].player;
            const stats = results[0].statistics?.[0];
            profileData = {
              nationality: player.nationality,
              age: player.age,
              currentClub: stats?.team?.name,
              position: stats?.games?.position,
              goalsThisSeason: stats?.goals?.total,
              assistsThisSeason: stats?.goals?.assists,
            };
          }
        } catch { /* bio still works without live stats */ }

        const bio = await ai.playerBio(playerName, profileData);

        const embed = EmbedFactory.ai(`Bio: ${playerName}`, bio);
                const helpRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('help:bio')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [embed] ,
          components: [helpRow]});
      } catch (err) {
        await interaction.editReply({ embeds: [EmbedFactory.error('Error', err.message || 'Could not generate biography.')] });
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
