'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { EmbedFactory }  = require('../../utils/embed');
const { rarityEmoji, rarityColor } = require('../../constants/rarities');
const { v4: uuidv4 }    = require('uuid');
const Card = require('../../models/Card');
const User = require('../../models/User');
const { logger } = require('../../utils/logger');

// Shared top-player pool for card generation
const PLAYER_POOL = [
  { id: 'mg1',  name: 'Lionel Messi',            team: 'Inter Miami',        pos: 'Attacker',   nationality: 'Argentina' },
  { id: 'cr7',  name: 'Cristiano Ronaldo',        team: 'Al Nassr',           pos: 'Attacker',   nationality: 'Portugal' },
  { id: 'km10', name: 'Kylian Mbappé',            team: 'Real Madrid',        pos: 'Attacker',   nationality: 'France' },
  { id: 'eh9',  name: 'Erling Haaland',           team: 'Manchester City',    pos: 'Attacker',   nationality: 'Norway' },
  { id: 'vj7',  name: 'Vinicius Jr',              team: 'Real Madrid',        pos: 'Attacker',   nationality: 'Brazil' },
  { id: 'ms11', name: 'Mohamed Salah',            team: 'Liverpool',          pos: 'Attacker',   nationality: 'Egypt' },
  { id: 'kdb17',name: 'Kevin De Bruyne',          team: 'Manchester City',    pos: 'Midfielder', nationality: 'Belgium' },
  { id: 'lm10', name: 'Luka Modrić',             team: 'Real Madrid',        pos: 'Midfielder', nationality: 'Croatia' },
  { id: 'jb5',  name: 'Jude Bellingham',          team: 'Real Madrid',        pos: 'Midfielder', nationality: 'England' },
  { id: 'hk9',  name: 'Harry Kane',               team: 'Bayern Munich',      pos: 'Attacker',   nationality: 'England' },
  { id: 'bs7',  name: 'Bukayo Saka',              team: 'Arsenal',            pos: 'Attacker',   nationality: 'England' },
  { id: 'dr41', name: 'Declan Rice',              team: 'Arsenal',            pos: 'Midfielder', nationality: 'England' },
  { id: 'vvd4', name: 'Virgil van Dijk',          team: 'Liverpool',          pos: 'Defender',   nationality: 'Netherlands' },
  { id: 'jm25', name: 'Jamal Musiala',            team: 'Bayern Munich',      pos: 'Midfielder', nationality: 'Germany' },
  { id: 'fw10', name: 'Florian Wirtz',            team: 'Bayer Leverkusen',   pos: 'Midfielder', nationality: 'Germany' },
  { id: 'kb9',  name: 'Karim Benzema',            team: 'Al Ittihad',         pos: 'Attacker',   nationality: 'France' },
  { id: 'rl17', name: 'Rafael Leão',              team: 'AC Milan',           pos: 'Attacker',   nationality: 'Portugal' },
  { id: 'ab1',  name: 'Alisson Becker',           team: 'Liverpool',          pos: 'Goalkeeper', nationality: 'Brazil' },
  { id: 'mn1',  name: 'Manuel Neuer',             team: 'Bayern Munich',      pos: 'Goalkeeper', nationality: 'Germany' },
  { id: 'jo13', name: 'Jan Oblak',                team: 'Atletico Madrid',    pos: 'Goalkeeper', nationality: 'Slovenia' },
  { id: 'rd3',  name: 'Rúben Dias',              team: 'Manchester City',    pos: 'Defender',   nationality: 'Portugal' },
  { id: 'rod16',name: 'Rodri',                    team: 'Manchester City',    pos: 'Midfielder', nationality: 'Spain' },
  { id: 'jk6',  name: 'Joshua Kimmich',           team: 'Bayern Munich',      pos: 'Midfielder', nationality: 'Germany' },
  { id: 'taa66',name: 'Trent Alexander-Arnold',   team: 'Real Madrid',        pos: 'Defender',   nationality: 'England' },
  { id: 'gv6',  name: 'Gavi',                     team: 'FC Barcelona',       pos: 'Midfielder', nationality: 'Spain' },
  { id: 'pe8',  name: 'Pedri',                    team: 'FC Barcelona',       pos: 'Midfielder', nationality: 'Spain' },
  { id: 'wz10', name: 'Alexia Putellas',          team: 'FC Barcelona',       pos: 'Midfielder', nationality: 'Spain' },
  { id: 'as7',  name: 'Antoine Griezmann',        team: 'Atletico Madrid',    pos: 'Attacker',   nationality: 'France' },
  { id: 'bs11', name: 'Bernardo Silva',           team: 'Manchester City',    pos: 'Midfielder', nationality: 'Portugal' },
  { id: 'ph47', name: 'Phil Foden',               team: 'Manchester City',    pos: 'Midfielder', nationality: 'England' },
];

/**
 * Generates card stats for a given rarity and position.
 */
function generateStats(rarity, position) {
  const base   = { common: 55, rare: 68, epic: 78, legendary: 88, limited: 93, seasonal: 85 };
  const floor  = base[rarity] || 60;
  const v      = () => Math.floor(Math.random() * 8) - 4;

  const isGK  = position === 'Goalkeeper';
  const isDef = position === 'Defender';
  const isMid = position === 'Midfielder';
  const isAtt = position === 'Attacker';

  const pace      = Math.min(99, Math.max(40, floor + v() + (isAtt ? 8 : isDef ? -5 : 0)));
  const shooting  = Math.min(99, Math.max(30, floor + v() + (isAtt ? 10 : isDef ? -15 : isGK ? -30 : 0)));
  const passing   = Math.min(99, Math.max(50, floor + v() + (isMid ? 8 : isGK ? -5 : 0)));
  const dribbling = Math.min(99, Math.max(40, floor + v() + (isAtt ? 8 : isGK ? -20 : 0)));
  const defending = Math.min(99, Math.max(30, floor + v() + (isDef ? 12 : isAtt ? -15 : isGK ? -10 : 0)));
  const physical  = Math.min(99, Math.max(50, floor + v()));
  const overall   = Math.floor((pace + shooting + passing + dribbling + defending + physical) / 6);

  return { pace, shooting, passing, dribbling, defending, physical, overall };
}

// ─── Command ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('givecard')
    .setDescription('Admin: Grant a special card to any user')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Who receives the card').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('rarity')
        .setDescription('Card rarity to give')
        .setRequired(true)
        .addChoices(
          { name: '🔴 Limited  (highest — very rare)',  value: 'limited' },
          { name: '🟡 Legendary',                       value: 'legendary' },
          { name: '🟣 Epic',                            value: 'epic' },
          { name: '🔵 Rare',                            value: 'rare' },
          { name: '⚪ Common',                          value: 'common' },
        )
    )
    .addStringOption((opt) =>
      opt.setName('player')
        .setDescription('Specific player name (optional — auto-picks best if blank)')
        .setRequired(false)
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      // Permission check: bot owner OR server administrator
      const isOwner = interaction.user.id === process.env.BOT_OWNER_ID;
      const isAdmin = interaction.memberPermissions?.has('Administrator');

      if (!isOwner && !isAdmin) {
        return interaction.reply({
          embeds: [EmbedFactory.error('Access Denied', 'Only server administrators can use this command.')],
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const targetUser  = interaction.options.getUser('user');
      const rarity      = interaction.options.getString('rarity');
      const playerQuery = interaction.options.getString('player')?.trim().toLowerCase();

      // Can't give a card to a bot
      if (targetUser.bot) {
        return interaction.editReply({
          embeds: [EmbedFactory.error('Invalid User', 'You can\'t give a card to a bot.')],
        });
      }

      // Resolve player
      let playerData;
      if (playerQuery) {
        playerData = PLAYER_POOL.find((p) => p.name.toLowerCase().includes(playerQuery));
        if (!playerData) {
          return interaction.editReply({
            embeds: [EmbedFactory.error(
              'Player Not Found',
              `No match for **"${playerQuery}"** in the card pool.\n\n` +
              `Try: Messi, Ronaldo, Haaland, Mbappé, Bellingham, Saka, Musiala…`
            )],
          });
        }
      } else {
        // Auto-pick: choose any position fairly (G/D/M/A all included)
        playerData = PLAYER_POOL[Math.floor(Math.random() * PLAYER_POOL.length)];
      }

      // Generate the card
      const stats  = generateStats(rarity, playerData.pos);
      const cardId = uuidv4();

      await Card.create({
        ownerId:      targetUser.id,
        cardId,
        playerId:     playerData.id,
        playerName:   playerData.name,
        teamName:     playerData.team,
        nationality:  playerData.nationality,
        position:     playerData.pos,
        rarity,
        stats,
        obtainedFrom: 'reward',
        edition:      rarity === 'limited' ? 'limited' : rarity === 'legendary' ? 'standard' : 'standard',
      });

      // Bump recipient's card count (create user doc if needed)
      await User.findOneAndUpdate(
        { userId: targetUser.id },
        { $inc: { cardsOwned: 1 }, $setOnInsert: { userId: targetUser.id, username: targetUser.username } },
        { upsert: true }
      );

      // Build confirmation embed
      const emoji    = rarityEmoji(rarity);
      const colorHex = rarityColor(rarity);
      const colorInt = parseInt(colorHex.replace('#', ''), 16);

      const confirmEmbed = new EmbedBuilder()
        .setColor(colorInt)
        .setTitle(`${emoji} Card Granted!`)
        .setDescription(
          `${emoji} **${playerData.name}** · ${playerData.pos} · \`${rarity.toUpperCase()}\`\n` +
          `*${playerData.team}  ·  ${playerData.nationality}*`
        )
        .addFields(
          {
            name: '📊 Card Stats',
            value:
              `PAC **${stats.pace}**  ·  SHO **${stats.shooting}**  ·  PAS **${stats.passing}**\n` +
              `DRI **${stats.dribbling}**  ·  DEF **${stats.defending}**  ·  PHY **${stats.physical}**\n` +
              `**OVR ${stats.overall}**`,
            inline: false,
          },
          { name: '👤 Recipient', value: `${targetUser.username} (${targetUser.id})`, inline: true },
          { name: '🆔 Card ID',   value: `\`${cardId.slice(0, 8)}\``,                 inline: true },
        )
        .setFooter({ text: `⚽ GoalX Admin  ·  Issued by ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [confirmEmbed] });

      // DM the recipient (best-effort)
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor(colorInt)
          .setTitle('🎁 You received a special card!')
          .setDescription(
            `${emoji} **${playerData.name}**  ·  ${playerData.pos}  ·  \`${rarity.toUpperCase()}\`\n` +
            `*${playerData.team}*  ·  OVR **${stats.overall}**\n\n` +
            `*Granted by an admin in ${interaction.guild?.name || 'GoalX'}.*`
          )
          .setFooter({ text: '⚽ GoalX  ·  Use /cards to view your collection' });

        const dmUser = await client.users.fetch(targetUser.id);
        await dmUser.send({ embeds: [dmEmbed] });
      } catch (_) { /* recipient has DMs closed — that's fine */ }
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
