'use strict';

const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');

/**
 * Checks if the interaction user has partner status (or is bot owner).
 * If not, sends an ephemeral denial embed and returns false.
 * Returns true if the user may proceed.
 */
async function requirePartner(interaction) {
  if (interaction.user.id === process.env.BOT_OWNER_ID) return true;

  const user = await User.findOne({ userId: interaction.user.id }).lean();
  if (user?.isPartner) return true;

  const embed = new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle('🤝 Partner-Exclusive Feature')
    .setDescription(
      '**This command is available to GoalX Partners only.**\n\n' +
      'Partners receive access to premium commands in exchange for supporting the bot with **4 votes per day**.\n\n' +
      '> Want partner access? Contact the bot owner.'
    )
    .addFields({
      name: '📋 Partner Perks',
      value: [
        '**AI Commands** — `/analyze` `/recap` `/impact`',
        '**Exclusive AI** — `/scout` `/tactics` `/deepdive` `/protip`',
        '**Betting** — `/duel` `/challenge` `/streak`',
        '**Cards** — `/openpack` `/vippack` `/trade` `/auction`',
        '**Economy** — `/payday` `/weekly` · +75% daily · +50% work',
        '**Fantasy** — `/myteam` `/challenges`',
        '**Profile** — Partner badge shown on your profile',
      ].join('\n'),
    })
    .setFooter({ text: '⚽ Powered by GoalX' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
  return false;
}

module.exports = { requirePartner };
