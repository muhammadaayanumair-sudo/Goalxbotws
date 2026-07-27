'use strict';

const { EmbedFactory } = require('../utils/embed');
const { CooldownManager } = require('../utils/cooldown');
const { refreshInteraction } = require('../utils/refreshInteraction');
const { logger } = require('../utils/logger');
const Log = require('../models/Log');
const User = require('../models/User');
const Guild = require('../models/Guild');

const cooldownManager = new CooldownManager();

/**
 * InteractionHandler - Processes all Discord interactions (slash commands, buttons, selects).
 * Handles permission checks, cooldowns, user/guild creation, and error reporting.
 */
class InteractionHandler {
  constructor(client) {
    this.client = client;
  }

  /**
   * Routes an incoming interaction to the appropriate handler.
   */
  async handle(interaction) {
    if (interaction.isChatInputCommand()) {
      await this._handleCommand(interaction);
    } else if (interaction.isButton()) {
      await this._handleButton(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await this._handleSelect(interaction);
    } else if (interaction.isModalSubmit()) {
      await this._handleModal(interaction);
    }
  }

  async _handleCommand(interaction) {
    const command = this.client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      // Run all DB pre-checks in parallel to stay well within Discord's 3-second window
      const [, , user, guildDoc] = await Promise.all([
        this._ensureUser(interaction),
        interaction.guildId ? this._ensureGuild(interaction) : Promise.resolve(),
        User.findOne({ userId: interaction.user.id }).select('banned banReason').lean(),
        interaction.guildId
          ? Guild.findOne({ guildId: interaction.guildId }).select('blacklisted blacklistReason').lean()
          : Promise.resolve(null),
      ]);

      // Check if user is banned from using the bot
      if (user?.banned) {
        return interaction.reply({
          embeds: [EmbedFactory.error('Banned', `You have been banned from GoalX.\nReason: ${user.banReason || 'No reason provided'}`)],
          flags: 64,
        });
      }

      // Check if this guild is blacklisted
      if (guildDoc?.blacklisted) {
        return interaction.reply({
          embeds: [EmbedFactory.error('Server Blacklisted', `This server has been blacklisted from GoalX.\nReason: ${guildDoc.blacklistReason || 'No reason provided'}`)],
          flags: 64,
        });
      }

      // Permission check
      if (command.permissions) {
        const missingPerms = command.permissions.filter(
          (p) => !interaction.member?.permissions.has(p)
        );
        if (missingPerms.length > 0) {
          return interaction.reply({
            embeds: [EmbedFactory.error('Missing Permissions', `You need: ${missingPerms.join(', ')}`)],
            ephemeral: true,
          });
        }
      }

      // Owner-only check
      if (command.ownerOnly && interaction.user.id !== process.env.BOT_OWNER_ID) {
        return interaction.reply({
          embeds: [EmbedFactory.error('Owner Only', 'This command is restricted to the bot owner.')],
          ephemeral: true,
        });
      }

      // Cooldown check
      const cooldownSeconds = command.cooldown || 3;
      const remaining = cooldownManager.check(command.data.name, interaction.user.id, cooldownSeconds);
      if (remaining > 0) {
        return interaction.reply({
          embeds: [EmbedFactory.warning('Cooldown', `Please wait **${remaining}s** before using \`/${command.data.name}\` again.`)],
          flags: 64,
        });
      }
      cooldownManager.set(command.data.name, interaction.user.id);

      // Execute the command
      await command.execute(interaction, this.client);

      // Log command usage
      await Log.create({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        type: 'command',
        action: interaction.commandName,
        details: { options: interaction.options?.data },
      }).catch(() => {});

      // Increment guild command usage
      if (interaction.guildId) {
        await Guild.findOneAndUpdate(
          { guildId: interaction.guildId },
          { $inc: { commandsUsed: 1 }, lastActivity: new Date() }
        ).catch(() => {});
      }
    } catch (err) {
      // Ignore expired interaction errors (user dismissed or Discord timed out) — nothing we can do
      if (err.code === 10062) return;

      logger.error(`[InteractionHandler] Error in /${interaction.commandName}:`, err);

      const errorEmbed = EmbedFactory.error(
        'Command Error',
        'Something went wrong while executing this command. The issue has been logged.'
      );

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [errorEmbed], flags: 64 });
        } else {
          await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
      } catch (_) { /* best-effort — interaction may have expired */ }

      await Log.create({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        type: 'error',
        action: interaction.commandName,
        success: false,
        errorMessage: err.message,
      }).catch(() => {});
    }
  }

  async _handleButton(interaction) {
    // Button handling is delegated to individual command collectors
    // This handles orphaned or global buttons
    const [action] = interaction.customId.split(':');
    logger.debug(`[InteractionHandler] Button: ${interaction.customId}`);

    try {
      // Handle pagination buttons
      if (action === 'page_prev' || action === 'page_next') {
        // Pagination is handled by individual command message collectors
        await interaction.deferUpdate().catch(() => {});
        return;
      }

      // Handle trade accept/reject buttons
      if (action === 'trade_accept' || action === 'trade_reject') {
        const { TradeService } = require('../services/economy/TradeService');
        const tradeService = new TradeService(this.client);
        await tradeService.handleButton(interaction);
        return;
      }

      // Handle auction bid button
      if (action === 'auction_bid') {
        await interaction.deferUpdate().catch(() => {});
        return;
      }

      // Generic refresh button: re-run the originating command's execute logic.
      if (action === 'refresh') {
        const commandName = interaction.customId.split(':')[1];
        const command = this.client.commands.get(commandName);
        if (command && typeof command.execute === 'function') {
          try {
            await command.execute(refreshInteraction(interaction), this.client);
            return;
          } catch (err) {
            logger.debug(`[InteractionHandler] Refresh fallback for /${commandName} failed:`, err.message);
            await interaction.deferUpdate().catch(() => {});
            return;
          }
        }
        await interaction.deferUpdate().catch(() => {});
        return;
      }

      // Help button: show a quick usage tip for the originating command.
      if (action === 'help') {
        const commandName = interaction.customId.split(':')[1];
        const command = this.client.commands.get(commandName);
        await interaction.reply({
          embeds: [EmbedFactory.base(
            `/${commandName}`,
            command?.data?.description || `Use \`/${commandName}\` for more information.`
          )],
          flags: 64,
        }).catch(() => {});
        return;
      }

      // Route command-specific buttons back to their command module
      if (action === 'globalevent' || action === 'guildwar' || action === 'leaderboard' || action === 'news' || action === 'live' || action === 'cards' || action === 'profile' || action === 'dashboard' || action === 'matchday' || action === 'myteam') {
        const command = this.client.commands.get(action);
        if (command && typeof command.handleButton === 'function') {
          await command.handleButton(interaction);
        } else {
          await interaction.deferUpdate().catch(() => {});
        }
        return;
      }

      // Fallback: collector-managed buttons whose collector has expired, or any
      // unrecognised button. Acknowledge silently so Discord doesn't show
      // "Interaction failed".
      await interaction.deferUpdate().catch(() => {});
    } catch (err) {
      logger.error('[InteractionHandler] Button error:', err);
      await interaction.reply({
        embeds: [EmbedFactory.error('Error', 'Failed to process this interaction.')],
        flags: 64,
      }).catch(() => {});
    }
  }

  async _handleSelect(interaction) {
    logger.debug(`[InteractionHandler] Select: ${interaction.customId}`);
    await interaction.deferUpdate().catch(() => {});
  }

  async _handleModal(interaction) {
    logger.debug(`[InteractionHandler] Modal: ${interaction.customId}`);
  }

  /**
   * Ensures user document exists in database, creates if not.
   */
  async _ensureUser(interaction) {
    await User.findOneAndUpdate(
      { userId: interaction.user.id },
      {
        $setOnInsert: {
          userId: interaction.user.id,
          discriminator: interaction.user.discriminator,
        },
        $set: {
          username: interaction.user.username,
          avatar: interaction.user.avatar,
        },
      },
      { upsert: true, new: true }
    );
  }

  /**
   * Ensures guild document exists in database, creates if not.
   */
  async _ensureGuild(interaction) {
    if (!interaction.guild) return;
    await Guild.findOneAndUpdate(
      { guildId: interaction.guildId },
      {
        $setOnInsert: {
          guildId: interaction.guildId,
          ownerId: interaction.guild.ownerId,
        },
        $set: {
          guildName: interaction.guild.name,
          icon: interaction.guild.icon,
          memberCount: interaction.guild.memberCount,
        },
      },
      { upsert: true, new: true }
    );
  }
}

module.exports = { InteractionHandler };
