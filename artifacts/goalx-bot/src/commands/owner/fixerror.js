'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require('discord.js');
const { logger } = require('../../utils/logger');
const { errorCollector } = require('../../services/selfhealing/ErrorCollector');
const { SelfHealingEngine } = require('../../services/selfhealing/SelfHealingEngine');

function isOwner(userId) {
  return userId === process.env.BOT_OWNER_ID;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fixerror')
    .setDescription('🔧 Autonomous crash repair — select an error for GPT-4.1 + GLM-5 to fix')
    .addStringOption(o =>
      o.setName('error_id')
        .setDescription('Error ID to fix directly (e.g. ERR-0003) — leave blank to browse')
        .setRequired(false)
    )
    .addBooleanOption(o =>
      o.setName('dry_run')
        .setDescription('Analyse only — do not write files or push to GitHub (default: false)')
        .setRequired(false)
    ),

  ownerOnly: true,
  cooldown: 10,

  async execute(interaction, client) {
    try {
      if (!isOwner(interaction.user.id)) {
        return interaction.reply({ content: '🔒 Owner only.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const errorId = interaction.options.getString('error_id');
      const dryRun  = interaction.options.getBoolean('dry_run') ?? false;
      const router  = client.aiRouter;

      if (!router) {
        return interaction.editReply({
          content: '❌ AiProviderRouter is not initialised. Restart the bot and try again.',
        });
      }

      // ── If specific ID given, go straight to confirmation ────────────────
      if (errorId) {
        const entry = errorCollector.getById(errorId);
        if (!entry) {
          return interaction.editReply({ content: `❌ Error \`${errorId}\` not found.` });
        }
        if (entry.resolved) {
          return interaction.editReply({ content: `✅ Error \`${errorId}\` is already resolved.` });
        }
        return this._confirmAndHeal(interaction, client, entry, dryRun);
      }

      // ── Browse unresolved errors ─────────────────────────────────────────
      const unresolved = errorCollector.getUnresolved().slice(0, 25);

      if (!unresolved.length) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#44FF88')
              .setTitle('✅ No unresolved errors')
              .setDescription('The error collector is clean. Nothing to fix!')
              .setTimestamp(),
          ],
        });
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId('fixerror:select')
        .setPlaceholder('Select an error to repair…')
        .addOptions(
          unresolved.map(e => ({
            label: `${e.id} — ${e.message.slice(0, 80)}`,
            description: `${e.type} · ${new Date(e.timestamp).toLocaleString()}`,
            value: e.id,
          }))
        );

      const row = new ActionRowBuilder().addComponents(select);

      const listEmbed = new EmbedBuilder()
        .setColor('#FF4444')
        .setTitle(`🔴 ${unresolved.length} Unresolved Error(s)`)
        .setDescription('Select an error below to trigger autonomous dual-engine repair.')
        .addFields(
          unresolved.slice(0, 10).map(e => ({
            name: `\`${e.id}\` ${e.type}`,
            value: e.message.slice(0, 120) + (e.message.length > 120 ? '…' : ''),
            inline: false,
          }))
        )
        .setFooter({ text: dryRun ? '🧪 Dry-run mode active — no files will be written' : 'Live mode — patch will be written and pushed' })
        .setTimestamp();

      const reply = await interaction.editReply({ embeds: [listEmbed], components: [row] });

      // Wait for selection (60s)
      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i => i.user.id === interaction.user.id,
        time: 60_000,
        max: 1,
      });

      collector.on('collect', async (sel) => {
        await sel.deferUpdate();
        const chosen = errorCollector.getById(sel.values[0]);
        if (!chosen) {
          await interaction.editReply({ content: '❌ Error not found.', components: [] });
          return;
        }
        await this._confirmAndHeal(interaction, client, chosen, dryRun);
      });

      collector.on('end', (_, reason) => {
        if (reason === 'time') {
          interaction.editReply({ content: '⏱️ Selection timed out.', components: [] }).catch(() => {});
        }
      });

    } catch (error) {
      logger.error(`[fixerror] Error:`, error);
      try {
        const msg = { content: `❌ /fixerror failed: ${error.message}`, components: [], ephemeral: true };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(msg);
        } else {
          await interaction.reply(msg);
        }
      } catch (_) { /* expired */ }
    }
  },

  async _confirmAndHeal(interaction, client, entry, dryRun) {
    const confirmEmbed = new EmbedBuilder()
      .setColor('#FFB344')
      .setTitle(`🔧 Confirm Auto-Repair — ${entry.id}`)
      .addFields(
        { name: '❌ Error', value: `\`\`\`${entry.message.slice(0, 300)}\`\`\`` },
        { name: '📁 Command', value: entry.command ? `/${entry.command}` : 'N/A', inline: true },
        { name: '🕐 Captured', value: new Date(entry.timestamp).toLocaleString(), inline: true },
      )
      .setDescription(
        `GPT-4.1 and GLM-5 will analyse this error in parallel and generate a consensus patch.\n\n` +
        (dryRun
          ? '🧪 **Dry-run mode** — analysis only, no file writes or Git push.'
          : '⚠️ **Live mode** — the patch will be written to disk and pushed to GitHub.')
      )
      .setFooter({ text: 'This process may take 15–60 seconds.' });

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('fixerror:confirm')
        .setLabel(dryRun ? '🧪 Run Analysis' : '🔧 Apply Fix')
        .setStyle(dryRun ? ButtonStyle.Secondary : ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('fixerror:cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    const msg = await interaction.editReply({ embeds: [confirmEmbed], components: [confirmRow] });

    const btn = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id,
      time: 30_000,
    }).catch(() => null);

    if (!btn || btn.customId === 'fixerror:cancel') {
      await interaction.editReply({ content: '↩️ Cancelled.', embeds: [], components: [] });
      return;
    }

    await btn.deferUpdate();

    // Show progress
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('#7B2FBE')
          .setTitle('⚙️ Dual-Engine Analysis Running…')
          .setDescription(
            '`GLM-5` and `GPT-4.1` are analysing the error in parallel.\n\n' +
            'This takes 15–60 seconds. You will receive a DM when complete.'
          )
          .setTimestamp(),
      ],
      components: [],
    });

    // Run healing engine
    const engine = new SelfHealingEngine(client.aiRouter, client);
    try {
      const result = await engine.heal(entry.id, {
        dryRun,
        notifyUserId: interaction.user.id,
      });

      const resultEmbed = new EmbedBuilder()
        .setColor(dryRun ? '#FFB344' : '#44FF88')
        .setTitle(`${dryRun ? '🧪 Analysis Complete' : '✅ Fix Applied'} — ${entry.id}`)
        .addFields(
          { name: '🔍 Root Cause', value: result.patch.rootCause || 'See patch details', inline: false },
          { name: '🔧 Change', value: result.patch.changeDescription.slice(0, 400), inline: false },
          { name: '📂 File', value: result.patch.affectedFile || 'Unknown', inline: true },
          { name: '🎯 Confidence', value: `${Math.round((result.patch.confidence || 0) * 100)}%`, inline: true },
          { name: '🤖 Engines', value: (result.patch.engines || []).join(' + ').toUpperCase(), inline: true },
          ...(result.commitUrl ? [{ name: '📌 Commit', value: result.commitUrl, inline: false }] : []),
        )
        .setFooter({ text: dryRun ? 'Dry run complete — use /fixerror without dry_run to apply' : 'Check DM for full details' })
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed], components: [] });

    } catch (healErr) {
      logger.error(`[fixerror] Healing failed for ${entry.id}:`, healErr);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#FF4444')
            .setTitle(`❌ Auto-Repair Failed — ${entry.id}`)
            .setDescription(`\`\`\`${healErr.message.slice(0, 500)}\`\`\``)
            .addFields({ name: '💡 Suggestion', value: 'Try `/fixerror dry_run:true` first, or fix manually and use `/botadmin` to notify.' })
            .setTimestamp(),
        ],
        components: [],
      });
    }
  },
};
