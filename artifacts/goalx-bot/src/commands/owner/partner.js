'use strict';

const { SlashCommandBuilder, EmbedBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');
const { EmbedFactory } = require('../../utils/embed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('partner')
    .setDescription('🤝 Manage GoalX partners (owner only)')
    .addSubcommand((sub) =>
      sub.setName('add')
        .setDescription('🤝 Grant partner status to a user')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('🤝 User to grant partner status').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('remove')
        .setDescription('🤝 Revoke partner status from a user')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('🤝 User to revoke partner status from').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list')
        .setDescription('🤝 List all current partners')
    )
    .addSubcommand((sub) =>
      sub.setName('check')
        .setDescription('🤝 Check partner status of a user')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('🤝 User to check').setRequired(true)
        )
    ),

  async execute(interaction) {
  try {
      if (interaction.user.id !== process.env.BOT_OWNER_ID) {
                const helpRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('help:partner')
            .setLabel('❓ Help')
            .setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ content: '❌ This command is restricted to the bot owner.', ephemeral: true ,
          components: [helpRow]});
      }

      await interaction.deferReply({ ephemeral: true });
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const target = interaction.options.getUser('user');

        let user = await User.findOne({ userId: target.id });
        if (!user) {
          user = new User({ userId: target.id, username: target.username });
        }

        if (user.isPartner) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🤝 Already a Partner')
                .setDescription(`**${target.username}** is already a GoalX Partner (since <t:${Math.floor(user.partnerSince.getTime() / 1000)}:D>).`)
                .setTimestamp(),
            ],
          });
        }

        user.isPartner = true;
        user.partnerSince = new Date();
        await user.save();

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#FFD700')
              .setTitle('✅ Partner Added')
              .setDescription(`**${target.username}** is now a GoalX Partner and has access to all partner-exclusive commands.`)
              .addFields({ name: '🤝 Partner Since', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true })
              .setThumbnail(target.displayAvatarURL())
              .setTimestamp(),
          ],
        });
      }

      if (sub === 'remove') {
        const target = interaction.options.getUser('user');
        const user = await User.findOne({ userId: target.id });

        if (!user?.isPartner) {
          return interaction.editReply({ content: `❌ **${target.username}** is not a partner.` });
        }

        user.isPartner = false;
        user.partnerSince = null;
        await user.save();

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#FF4444')
              .setTitle('🚫 Partner Removed')
              .setDescription(`**${target.username}**'s partner status has been revoked.`)
              .setTimestamp(),
          ],
        });
      }

      if (sub === 'list') {
        const partners = await User.find({ isPartner: true }).lean();

        if (!partners.length) {
          return interaction.editReply({ content: 'No partners yet. Use `/partner add` to grant partner status.' });
        }

        const list = partners
          .map((p, i) => {
            const since = p.partnerSince ? `<t:${Math.floor(new Date(p.partnerSince).getTime() / 1000)}:R>` : 'Unknown';
            return `**${i + 1}.** ${p.username} (\`${p.userId}\`) — Partner since ${since}`;
          })
          .join('\n');

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#FFD700')
              .setTitle(`🤝 GoalX Partners (${partners.length})`)
              .setDescription(list.slice(0, 4000))
              .setFooter({ text: 'Partners exchange 4 votes/day for premium access' })
              .setTimestamp(),
          ],
        });
      }

      if (sub === 'check') {
        const target = interaction.options.getUser('user');
        const user = await User.findOne({ userId: target.id }).lean();

        const isPartner = user?.isPartner || false;
        const since = isPartner && user.partnerSince
          ? `<t:${Math.floor(new Date(user.partnerSince).getTime() / 1000)}:F>`
          : 'N/A';

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(isPartner ? '#FFD700' : '#95A5A6')
              .setTitle(`${isPartner ? '🤝' : '👤'} Partner Status: ${target.username}`)
              .addFields(
                { name: '🤝 Status', value: isPartner ? '✅ Partner' : '❌ Not a Partner', inline: true },
                { name: '🤝 Partner Since', value: since, inline: true }
              )
              .setThumbnail(target.displayAvatarURL())
              .setTimestamp(),
          ],
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
