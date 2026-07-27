'use strict';

/**
 * TradeService — placeholder for card trading between users.
 * Handles button interactions for trade accept/reject flows.
 */
class TradeService {
  constructor(client) {
    this.client = client;
  }

  async handleButton(interaction) {
    const [action, tradeId] = interaction.customId.split(':');
    await interaction.reply({
      content: 'Trade system coming soon!',
      ephemeral: true,
    }).catch(() => {});
  }
}

module.exports = { TradeService };