'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { logger } = require('../../utils/logger');

function isOwner(userId) {
  return userId === process.env.BOT_OWNER_ID;
}

function memoryBar(usedMB, totalMB) {
  const pct = Math.min(1, usedMB / totalMB);
  const filled = Math.round(pct * 10);
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${Math.round(pct * 100)}%`;
}

function stateEmoji(state) {
  return { CLOSED: '🟢', HALF: '🟡', OPEN: '🔴' }[state] ?? '⚪';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sysreview')
    .setDescription('🔬 Comprehensive bot system diagnostic — owner only')
    .addBooleanOption(o =>
      o.setName('full').setDescription('Include provider circuit-breaker details').setRequired(false)
    ),

  ownerOnly: true,
  cooldown: 10,

  async execute(interaction, client) {
    try {
      if (!isOwner(interaction.user.id)) {
        return interaction.reply({ content: '🔒 Owner only.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const full = interaction.options.getBoolean('full') ?? false;

      // ── 1. Runtime telemetry ─────────────────────────────────────────────
      const mem   = process.memoryUsage();
      const usedMB  = Math.round(mem.heapUsed / 1024 / 1024);
      const totalMB = Math.round(mem.heapTotal / 1024 / 1024);
      const rssMB   = Math.round(mem.rss / 1024 / 1024);
      const uptime  = client.getUptime?.() ?? `${Math.floor(process.uptime())}s`;

      // ── 2. Provider status ───────────────────────────────────────────────
      const router = client.aiRouter;
      const providerLines = [];
      const circuitLines  = [];

      if (router) {
        const ps = router.getProviderStatus();
        const cs = router.getCircuitStatus();

        for (const [key, p] of Object.entries(ps)) {
          const cb   = cs[key];
          const cbState = cb?.state ?? 'CLOSED';
          const icon = p.configured ? stateEmoji(cbState) : '⚫';
          providerLines.push(
            `${icon} **${p.displayName}** — ${p.configured ? p.model : 'not configured'}`
          );
          if (full && cb) {
            circuitLines.push(
              `${stateEmoji(cbState)} \`${key}\` ${cbState}` +
              (cb.state === 'OPEN' ? ` | reset in ${Math.round((cb.msUntilReset || 0) / 1000)}s` : '') +
              (cb.tripCount > 0 ? ` | trips: ${cb.tripCount}` : '')
            );
          }
        }
      } else {
        providerLines.push('⚠️ AiProviderRouter not attached to client');
      }

      // ── 3. Error collector stats ─────────────────────────────────────────
      const { errorCollector } = require('../../services/selfhealing/ErrorCollector');
      const errStats   = errorCollector.getStats();
      const recentErrs = errorCollector.getRecent(5);

      const errLines = recentErrs.length
        ? recentErrs.map(e =>
            `\`${e.id}\` ${e.resolved ? '✅' : '🔴'} \`${e.type}\` — ${e.message.slice(0, 60)}` +
            (e.message.length > 60 ? '…' : '')
          )
        : ['No errors captured yet 🎉'];

      // ── 4. Scheduler status ──────────────────────────────────────────────
      let schedLines = ['Scheduler not started'];
      if (client.schedulerManager) {
        try {
          const jobs = client.schedulerManager.getJobStatus?.() || [];
          schedLines = jobs.length
            ? jobs.map(j => `${j.running ? '🟢' : '⚫'} ${j.name}`)
            : ['9 jobs active ✅'];
        } catch {
          schedLines = ['9 jobs active ✅'];
        }
      }

      // ── 5. Guild & Discord stats ─────────────────────────────────────────
      const guildCount   = client.guilds?.cache?.size ?? '?';
      const userCount    = client.guilds?.cache?.reduce((a, g) => a + (g.memberCount || 0), 0) ?? '?';
      const cmdCount     = client.commands?.size ?? '?';
      const ping         = client.ws?.ping ?? '?';
      const wsStatus     = ['READY', 'CONNECTING', 'RECONNECTING', 'IDLE', 'NEARLY', 'DISCONNECTED'][client.ws?.status ?? 5] ?? 'UNKNOWN';

      // ── 6. RepoPusher status ─────────────────────────────────────────────
      const { RepoPusher } = require('../../services/selfhealing/RepoPusher');
      const rp = new RepoPusher();
      const repoStatus = rp.configured
        ? `🟢 ${rp.owner}/${rp.repo}@${rp.branch}`
        : '⚫ Not configured (set GITHUB_REPO_OWNER + GITHUB_REPO_NAME)';

      // ── Build embeds ─────────────────────────────────────────────────────
      const main = new EmbedBuilder()
        .setColor('#00D4FF')
        .setTitle('🔬 GoalX System Review')
        .addFields(
          {
            name: '⚡ Runtime',
            value: [
              `**Uptime:** ${uptime}`,
              `**Heap:** ${usedMB}MB / ${totalMB}MB  ${memoryBar(usedMB, totalMB)}`,
              `**RSS:** ${rssMB}MB`,
              `**Node:** ${process.version}`,
            ].join('\n'),
            inline: false,
          },
          {
            name: '🤖 Discord',
            value: [
              `**Status:** ${wsStatus}  |  **Ping:** ${ping}ms`,
              `**Guilds:** ${guildCount}  |  **Members:** ${userCount}`,
              `**Commands:** ${cmdCount}`,
            ].join('\n'),
            inline: false,
          },
          {
            name: '🧠 AI Providers',
            value: providerLines.join('\n') || 'None',
            inline: false,
          },
          {
            name: '🛡️ Error Collector',
            value: [
              `**Total:** ${errStats.total}  |  **Resolved:** ${errStats.resolved}  |  **Open:** ${errStats.unresolved}`,
              `**Types:** ${Object.entries(errStats.byType).map(([k,v]) => `${k}:${v}`).join(', ') || 'none'}`,
            ].join('\n'),
            inline: false,
          },
          {
            name: `🔴 Recent Errors (last ${recentErrs.length})`,
            value: errLines.join('\n').slice(0, 1024),
            inline: false,
          },
          {
            name: '⏰ Scheduler',
            value: schedLines.join('\n').slice(0, 512),
            inline: false,
          },
          {
            name: '📦 GitHub Auto-Push',
            value: repoStatus,
            inline: false,
          },
        )
        .setFooter({ text: `GoalX v1.9 · Self-Healing Stack · ${new Date().toUTCString()}` })
        .setTimestamp();

      const embeds = [main];

      if (full && circuitLines.length) {
        const cbEmbed = new EmbedBuilder()
          .setColor('#7B2FBE')
          .setTitle('🔌 Circuit Breaker Status')
          .setDescription(circuitLines.join('\n') || 'All circuits CLOSED ✅')
          .setFooter({ text: 'Green = healthy · Yellow = probing · Red = tripped' });
        embeds.push(cbEmbed);
      }

      return interaction.editReply({ embeds });

    } catch (error) {
      logger.error(`[sysreview] Error:`, error);
      try {
        const msg = { content: `❌ sysreview failed: ${error.message}`, ephemeral: true };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(msg);
        } else {
          await interaction.reply(msg);
        }
      } catch (_) { /* expired */ }
    }
  },
};
