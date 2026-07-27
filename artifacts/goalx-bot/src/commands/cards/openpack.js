'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EmbedFactory } = require('../../utils/embed');
const { formatCoins } = require('../../utils/formatters');
const { CardService } = require('../../services/cards/CardService');
const { requirePartner } = require('../../utils/partnerGuard');
const config = require('../../config/config');
const { rarityColor, rarityEmoji, highestRarity } = require('../../constants/rarities');
const { logger } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('openpack')
    .setDescription('🎁 Open a football card pack')
    .addStringOption((opt) =>
      opt.setName('type')
        .setDescription('🎁 Pack type to open')
        .setRequired(true)
        .addChoices(
          { name: `⚪ Basic Pack (${config.cards.packPrices.basic.toLocaleString()} coins)`,   value: 'basic'   },
          { name: `🔵 Premium Pack (${config.cards.packPrices.premium.toLocaleString()} coins)`, value: 'premium' },
          { name: `🟡 Elite Pack (${config.cards.packPrices.elite.toLocaleString()} coins)`,   value: 'elite'   }
        )
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      await interaction.deferReply();
      const packType    = interaction.options.getString('type');
      const cardService = new CardService(client.cache);

      try {
        const { cards, coinsSpent } = await cardService.openPack(interaction.user.id, packType);

        const packEmojis = { basic: '⚪', premium: '🔵', elite: '🟡' };

        const embed = EmbedFactory.card(
          `${packEmojis[packType]} ${packType.charAt(0).toUpperCase() + packType.slice(1)} Pack Opened!`,
          `Spent ${formatCoins(coinsSpent)} → received **${cards.length} cards**\n`
        ).setColor(rarityColor(highestRarity(cards)));

        EmbedFactory.addFields(embed, cards.map((card) => ({
          name: `${rarityEmoji(card.rarity)} **${card.playerName}** — ${card.rarity.toUpperCase()}`,
          value: [
            `*${card.teamName} · ${card.position} · OVR ⭐${card.stats.overall}*`,
            `PAC ${card.stats.pace} · SHO ${card.stats.shooting} · PAS ${card.stats.passing} · DRI ${card.stats.dribbling} · DEF ${card.stats.defending} · PHY ${card.stats.physical}`,
          ].join('\n'),
        })));
        embed.setFooter({ text: '⚽ Powered by GoalX Cards · Use /cards to view your collection' });

        const viewBtn = new ButtonBuilder().setCustomId('view_cards').setLabel('📋 View Collection').setStyle(ButtonStyle.Primary);
        const teamBtn = new ButtonBuilder().setCustomId('view_myteam').setLabel('👥 Build My Team').setStyle(ButtonStyle.Success);
        const openAgainBtn = new ButtonBuilder().setCustomId(`open_again:${packType}`).setLabel('🔄 Open Another').setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder().addComponents(viewBtn, teamBtn, openAgainBtn);

        const msg = await interaction.editReply({ embeds: [embed], components: [row] });

        const collector = msg.createMessageComponentCollector({
          filter: (i) =>
            ['view_cards', 'view_myteam'].includes(i.customId) ||
            i.customId.startsWith('open_again:'),
          time: 60_000,
          max: 1,
        });

        collector.on('collect', async (i) => {
          if (i.customId === 'view_cards') {
            await i.reply({ content: '📋 Use `/cards` to browse your full collection!', ephemeral: true });
          }
          if (i.customId === 'view_myteam') {
            await i.reply({ content: '👥 Use `/myteam best` to auto-build your best 11, or `/myteam view` to see your current lineup!', ephemeral: true });
          }
          if (i.customId.startsWith('open_again:')) {
            const type = i.customId.split(':')[1];
            await i.reply({ content: `🔄 Use \`/openpack type:${type}\` to open another pack!`, ephemeral: true });
          }
        });

      } catch (err) {
        await interaction.editReply({
          embeds: [EmbedFactory.error('Pack Failed', err.message || 'Could not open pack. Please try again.')],
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
