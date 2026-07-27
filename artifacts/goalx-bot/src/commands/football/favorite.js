'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('favorite')
    .setDescription('⭐ Manage your favorite teams and players')
    .addSubcommand((sub) =>
      sub.setName('add')
        .setDescription('⭐ Add a favorite team or player')
        .addStringOption((opt) => opt.setName('type').setDescription('⭐ Team or Player').setRequired(true)
          .addChoices({ name: '⭐ Team', value: 'team' }, { name: '⭐ Player', value: 'player' }))
        .addStringOption((opt) => opt.setName('name').setDescription('⭐ Name to add').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('remove')
        .setDescription('⭐ Remove a favorite')
        .addStringOption((opt) => opt.setName('type').setDescription('⭐ Team or Player').setRequired(true)
          .addChoices({ name: '⭐ Team', value: 'team' }, { name: '⭐ Player', value: 'player' }))
        .addStringOption((opt) => opt.setName('name').setDescription('⭐ Name to remove').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('⭐ List your favorites')
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      const sub = interaction.options.getSubcommand();
      const userId = interaction.user.id;

      let user = await User.findOne({ userId });
      if (!user) user = await User.create({ userId, username: interaction.user.username });

      if (sub === 'list') {
        const embed = EmbedFactory.base('❤️ **Your Favorites**')
          .addFields(
            {
              name: '⚽ Teams',
              value: user.favoriteTeams?.length ? user.favoriteTeams.map((t) => `• **${t}**`).join('\n') : '*No favorite teams yet — use `/favorite add type:Team`*',
              inline: true,
            },
            {
              name: '👤 Players',
              value: user.favoritePlayers?.length ? user.favoritePlayers.map((p) => `• **${p}**`).join('\n') : '*No favorite players yet.*',
              inline: true,
            }
          );
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('refresh:favorite').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      const type = interaction.options.getString('type');
      const name = interaction.options.getString('name');
      const field = type === 'team' ? 'favoriteTeams' : 'favoritePlayers';
      const maxFavs = 10;

      if (sub === 'add') {
        if ((user[field]?.length || 0) >= maxFavs) {
          return interaction.reply({
            embeds: [EmbedFactory.warning('Limit Reached', `You can only have ${maxFavs} favorite ${type}s.`)],
            ephemeral: true,
          });
        }
        if (user[field]?.includes(name)) {
          return interaction.reply({
            embeds: [EmbedFactory.warning('Already Added', `**${name}** is already in your favorites.`)],
            ephemeral: true,
          });
        }
        await User.findOneAndUpdate({ userId }, { $addToSet: { [field]: name } });
        return interaction.reply({
          embeds: [EmbedFactory.success('Favorite Added! ❤️', `**${name}** added to your favorite ${type}s.`)],
          ephemeral: true,
        });
      }

      if (sub === 'remove') {
        await User.findOneAndUpdate({ userId }, { $pull: { [field]: name } });
        return interaction.reply({
          embeds: [EmbedFactory.success('Removed', `**${name}** removed from your favorites.`)],
          ephemeral: true,
        });
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
