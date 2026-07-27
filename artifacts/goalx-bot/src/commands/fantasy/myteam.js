'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { EmbedFactory }  = require('../../utils/embed');
const { TeamService }   = require('../../services/team/TeamService');
const { formatNumber }  = require('../../utils/formatters');
const { requirePartner } = require('../../utils/partnerGuard');
const { rarityColor, rarityEmoji, highestRarity } = require('../../constants/rarities');
const { logger } = require('../../utils/logger');

const POS_EMOJI = {
  Goalkeeper: '🧤',
  Defender:   '🛡️',
  Midfielder: '⚙️',
  Attacker:   '⚽',
};

/**
 * Builds the main team view embed showing all 11 slots.
 */
function buildTeamEmbed(team, targetUser) {
  const slots    = TeamService.getFormationSlots(team.formation);
  const filled   = team.players.length;
  const complete = filled === 11;

  // Pick embed colour from the highest rarity card in the team
  const topRarity = highestRarity(team.players);

  const embed = EmbedFactory.base()
    .setColor(rarityColor(topRarity))
    .setTitle(`⚽ **${team.teamName}** — ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL())
    .setFooter({ text: `⚽ Powered by GoalX · ${team.formation} · ${filled}/11 players` });

  // ── Overview row ──────────────────────────────────────────
  const extras = [];
  if (team.motto) extras.push(`🗣️ *${team.motto}*`);
  if (team.tactic) extras.push(`📋 Tactic: **${team.tactic}**`);

  embed.setDescription(
    `**Formation:** ${team.formation}   **Rating:** ⭐ ${team.teamRating || '—'}   **Players:** ${filled}/11${complete ? '  ✅ Complete' : '  ⚠️ Incomplete'}\n` +
    (extras.length ? extras.join(' · ') + '\n' : '')
  );

  // ── Players grouped by position ───────────────────────────
  const groups = { Goalkeeper: [], Defender: [], Midfielder: [], Attacker: [] };

  for (const slot of slots) {
    const player = team.players.find((p) => p.slotIndex === slot.index);
    const posGroup = groups[slot.position];
    if (player) {
      const re = rarityEmoji(player.rarity);
      posGroup.push(`**${slot.index}.** ${re} **${player.playerName}** (OVR ${player.overall}) — *${player.teamName}*`);
    } else {
      posGroup.push(`**${slot.index}.** ⬜ *Empty — ${slot.label}*`);
    }
  }

  for (const [pos, lines] of Object.entries(groups)) {
    if (!lines.length) continue;
    embed.addFields({
      name:   `${POS_EMOJI[pos]} ${pos}s`,
      value:  lines.join('\n'),
      inline: false,
    });
  }

  // ── Team stats bar ────────────────────────────────────────
  if (filled > 0) {
    const s = team.totalStats;
    embed.addFields({
      name:  '📊 Average Team Stats',
      value: [
        `**PAC** ${s.pace}  **SHO** ${s.shooting}  **PAS** ${s.passing}`,
        `**DRI** ${s.dribbling}  **DEF** ${s.defending}  **PHY** ${s.physical}`,
      ].join('\n'),
      inline: false,
    });
  }

  return embed;
}

/**
 * Builds the action buttons row shown under the team embed.
 */
function buildButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('myteam_refresh')
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('myteam_clear_confirm')
      .setLabel('🗑️ Clear Team')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

// ─────────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('myteam')
    .setDescription('👕 Manage your personal 11-player football team')

    // ── view ──────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('view')
        .setDescription('👕 View your current team lineup')
        .addUserOption((opt) =>
          opt.setName('user')
            .setDescription('👤 View another user\'s team')
            .setRequired(false)
        )
    )

    // ── add ───────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('add')
        .setDescription('👕 Add a card from your collection to your team')
        .addStringOption((opt) =>
          opt.setName('cardid')
            .setDescription('👕 Card ID (first 8 characters from /cards)')
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName('slot')
            .setDescription('👕 Slot number 0-10  (0=GK  1-4=DEF  5-7=MID  8-10=ATT)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(10)
        )
    )

    // ── remove ────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('remove')
        .setDescription('👕 Remove a player from your team')
        .addStringOption((opt) =>
          opt.setName('slot')
            .setDescription('👕 Slot number (0-10) or card ID prefix')
            .setRequired(true)
        )
    )

    // ── best ──────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('best')
        .setDescription('👕 Auto-select your best 11 players from your entire card collection')
        .addStringOption((opt) =>
          opt.setName('formation')
            .setDescription('👕 Formation to use (default: your current formation)')
            .setRequired(false)
            .addChoices(
              { name: '👕 4-3-3', value: '4-3-3' },
              { name: '👕 4-4-2', value: '4-4-2' },
              { name: '👕 3-5-2', value: '3-5-2' },
              { name: '👕 4-2-3-1', value: '4-2-3-1' }
            )
        )
    )

    // ── rename ────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('rename')
        .setDescription('👕 Rename your team')
        .addStringOption((opt) =>
          opt.setName('name')
            .setDescription('👕 New team name (max 32 characters)')
            .setRequired(true)
            .setMaxLength(32)
        )
    )

    // ── formation ─────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('formation')
        .setDescription('👕 Change your team formation')
        .addStringOption((opt) =>
          opt.setName('value')
            .setDescription('👕 Formation')
            .setRequired(true)
            .addChoices(
              { name: '👕 4-3-3', value: '4-3-3' },
              { name: '👕 4-4-2', value: '4-4-2' },
              { name: '👕 3-5-2', value: '3-5-2' },
              { name: '👕 4-2-3-1', value: '4-2-3-1' }
            )
        )
    )

    // ── clear ─────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('clear')
        .setDescription('👕 Remove all players from your team')
    )

    // ── motto ─────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('motto')
        .setDescription('👕 Set or update your team motto')
        .addStringOption((opt) =>
          opt.setName('text')
            .setDescription('👕 Your team motto (max 120 characters)')
            .setRequired(true)
            .setMaxLength(120)
        )
    )

    // ── tactic ────────────────────────────────────────────────
    .addSubcommand((sub) =>
      sub.setName('tactic')
        .setDescription('👕 Set your team playing style')
        .addStringOption((opt) =>
          opt.setName('style')
            .setDescription('👕 Playing style')
            .setRequired(true)
            .addChoices(
              { name: '👕 Balanced', value: 'Balanced' },
              { name: '👕 Counter Attack', value: 'Counter Attack' },
              { name: '👕 High Press', value: 'High Press' },
              { name: '👕 Possession', value: 'Possession' },
              { name: '👕 Park the Bus', value: 'Park the Bus' },
              { name: '👕 Tiki-Taka', value: 'Tiki-Taka' },
              { name: '👕 Long Ball', value: 'Long Ball' }
            )
        )
    ),

  cooldown: 5,

  async execute(interaction, client) {
  try {
      if (!await requirePartner(interaction)) return;
      const sub = interaction.options.getSubcommand();

      // ── /myteam view ──────────────────────────────────────────
      if (sub === 'view') {
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const team = await TeamService.getOrCreate(targetUser.id);
        const embed = buildTeamEmbed(team, targetUser);
        const row   = buildButtons();
        const msg   = await interaction.editReply({ embeds: [embed], components: [row] });

        // Collector for refresh / clear buttons (owner only)
        const collector = msg.createMessageComponentCollector({
          filter: (i) =>
            ['myteam_refresh', 'myteam_clear_confirm'].includes(i.customId) &&
            i.user.id === interaction.user.id,
          time: 120_000,
        });

        collector.on('collect', async (i) => {
          if (i.customId === 'myteam_refresh') {
            await i.deferUpdate();
            const fresh = await TeamService.getOrCreate(targetUser.id);
            await i.editReply({ embeds: [buildTeamEmbed(fresh, targetUser)], components: [buildButtons()] });
          }

          if (i.customId === 'myteam_clear_confirm') {
            // Ask for confirmation
            const confirmRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('myteam_clear_yes').setLabel('✅ Yes, clear it').setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId('myteam_clear_no').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary),
            );
            await i.update({
              embeds: [EmbedFactory.warning('Clear Team?', 'This will remove all 11 players from your team. Your cards stay in your collection.')],
              components: [confirmRow],
            });
          }
        });

        // Second collector for clear confirmation buttons
        const confirmCollector = msg.createMessageComponentCollector({
          filter: (i) =>
            ['myteam_clear_yes', 'myteam_clear_no'].includes(i.customId) &&
            i.user.id === interaction.user.id,
          time: 30_000,
          max: 1,
        });

        confirmCollector.on('collect', async (i) => {
          if (i.customId === 'myteam_clear_yes') {
            await i.deferUpdate();
            const clearedTeam = await TeamService.clearTeam(interaction.user.id);
            await i.editReply({
              embeds: [EmbedFactory.success('Team Cleared', 'Your team has been reset. Use `/myteam best` to auto-fill or `/myteam add` to rebuild.')],
              components: [],
            });
          } else {
            await i.deferUpdate();
            const fresh = await TeamService.getOrCreate(targetUser.id);
            await i.editReply({ embeds: [buildTeamEmbed(fresh, targetUser)], components: [buildButtons()] });
          }
        });

        collector.on('end', () => {
          interaction.editReply({ components: [] }).catch(() => {});
        });
        return;
      }

      // ── /myteam add ───────────────────────────────────────────
      if (sub === 'add') {
        await interaction.deferReply({ ephemeral: true });
        const cardIdInput = interaction.options.getString('cardid');
        const slot        = interaction.options.getInteger('slot');

        try {
          const { team, replaced } = await TeamService.addPlayer(interaction.user.id, cardIdInput, slot);
          const slots = TeamService.getFormationSlots(team.formation);
          const slotLabel = slots.find((s) => s.index === slot)?.label || `#${slot}`;

          const addedPlayer = team.players.find((p) => p.slotIndex === slot);
          const re = rarityEmoji(addedPlayer?.rarity);

          const lines = [
            `${re} **${addedPlayer?.playerName}** added to slot **${slot} (${slotLabel})**`,
            replaced ? `\n*Replaced: ${rarityEmoji(replaced.rarity)} ${replaced.playerName}*` : '',
            `\nTeam rating: ⭐ ${team.teamRating}   Players: ${team.players.length}/11`,
          ];

          await interaction.editReply({
            embeds: [EmbedFactory.success('Player Added! ✅', lines.join(''))],
          });
        } catch (err) {
          await interaction.editReply({
            embeds: [EmbedFactory.error('Could Not Add Player', err.message)],
          });
        }
        return;
      }

      // ── /myteam remove ────────────────────────────────────────
      if (sub === 'remove') {
        await interaction.deferReply({ ephemeral: true });
        const input = interaction.options.getString('slot');

        try {
          const { team, removed } = await TeamService.removePlayer(interaction.user.id, input);
          const re = rarityEmoji(removed.rarity);

          await interaction.editReply({
            embeds: [EmbedFactory.success('Player Removed', `${re} **${removed.playerName}** has been removed from slot ${removed.slotIndex}.\n\nTeam: ${team.players.length}/11 players`)],
          });
        } catch (err) {
          await interaction.editReply({
            embeds: [EmbedFactory.error('Could Not Remove', err.message)],
          });
        }
        return;
      }

      // ── /myteam best ──────────────────────────────────────────
      if (sub === 'best') {
        await interaction.deferReply();
        const formation = interaction.options.getString('formation') || null;

        try {
          const { team, selected } = await TeamService.autoBest(interaction.user.id, formation);

          // Build a summary of selected players
          const lines = selected.map(({ card, slot }) => {
            const slots    = TeamService.getFormationSlots(team.formation);
            const slotData = slots.find((s) => s.index === slot.index);
            const re = rarityEmoji(card.rarity);
            return `**${slot.index}.** (${slotData?.label}) ${re} **${card.playerName}** OVR ${card.stats.overall} — *${card.teamName}*`;
          });

          const embed = EmbedFactory.success(
            `Best XI Auto-Selected — ${team.teamName}`,
            `Formation: **${team.formation}**   Team Rating: ⭐ **${team.teamRating}**\n\n${lines.join('\n')}`
          );

          EmbedFactory.addFields(embed, [{
            name: '📊 Average Team Stats',
            value: EmbedFactory.statBlock([
              ['PAC', team.totalStats.pace], ['SHO', team.totalStats.shooting], ['PAS', team.totalStats.passing],
              ['DRI', team.totalStats.dribbling], ['DEF', team.totalStats.defending], ['PHY', team.totalStats.physical],
            ]),
          }]);
          embed.setFooter({ text: '⚽ Powered by GoalX · Use /myteam view to see your full squad' });

          await interaction.editReply({ embeds: [embed] });
        } catch (err) {
          await interaction.editReply({
            embeds: [EmbedFactory.error('Auto-Select Failed', err.message)],
          });
        }
        return;
      }

      // ── /myteam rename ────────────────────────────────────────
      if (sub === 'rename') {
        const newName = interaction.options.getString('name');
        const team    = await TeamService.renameTeam(interaction.user.id, newName);
        return interaction.reply({
          embeds: [EmbedFactory.success('Team Renamed! ✏️', `Your team is now called **${team.teamName}**`)],
          ephemeral: true,
        });
      }

      // ── /myteam formation ─────────────────────────────────────
      if (sub === 'formation') {
        const value = interaction.options.getString('value');
        try {
          const team = await TeamService.setFormation(interaction.user.id, value);
          return interaction.reply({
            embeds: [EmbedFactory.success('Formation Updated! 🔶', `Formation set to **${team.formation}**\n\nNote: Slot positions have changed. Use \`/myteam best\` to re-arrange automatically.`)],
            ephemeral: true,
          });
        } catch (err) {
          return interaction.reply({
            embeds: [EmbedFactory.error('Invalid Formation', err.message)],
            ephemeral: true,
          });
        }
      }

      // ── /myteam clear ─────────────────────────────────────────
      if (sub === 'clear') {
        await TeamService.clearTeam(interaction.user.id);
        return interaction.reply({
          embeds: [EmbedFactory.success('Team Cleared 🗑️', 'All players removed. Your cards are still in your collection.\n\nUse `/myteam best` to auto-fill with your best cards.')],
          ephemeral: true,
        });
      }

      // ── /myteam motto ─────────────────────────────────────────
      if (sub === 'motto') {
        const text = interaction.options.getString('text');
        const team = await TeamService.getOrCreate(interaction.user.id);
        team.motto = text;
        await team.save();
        return interaction.reply({
          embeds: [EmbedFactory.success('Motto Updated! ✏️', `Your team motto is now:\n> *${text}*`)],
          ephemeral: true,
        });
      }

      // ── /myteam tactic ───────────────────────────────────────
      if (sub === 'tactic') {
        const style = interaction.options.getString('style');
        const team = await TeamService.getOrCreate(interaction.user.id);
        team.tactic = style;
        await team.save();
        return interaction.reply({
          embeds: [EmbedFactory.success('Tactic Set! ⚽', `Your team will play **${style}** style.`)],
          ephemeral: true,
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
