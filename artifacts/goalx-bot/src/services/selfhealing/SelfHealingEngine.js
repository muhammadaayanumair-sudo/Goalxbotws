'use strict';

const fs   = require('fs');
const path = require('path');
const { logger } = require('../../utils/logger');
const { errorCollector } = require('./ErrorCollector');
const { RepoPusher }     = require('./RepoPusher');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

const DIAGNOSTIC_SYSTEM = `You are an elite autonomous Node.js bot crash-repair system.
Your task is to:
1. Analyze the runtime error precisely
2. Locate the exact fault in the provided source code
3. Generate a minimal, surgical code patch that fixes ONLY the fault
4. Output ONLY valid JSON in the format below — no markdown, no prose

Required output format (strict JSON):
{
  "rootCause": "One-sentence explanation of the root cause",
  "affectedFile": "relative/path/to/file.js",
  "fix": "The complete corrected file content",
  "confidence": 0.0-1.0,
  "changeDescription": "What changed and why it fixes the error"
}

Rules:
- If you cannot determine the fix with confidence > 0.5, set confidence to 0 and leave fix as null
- Never introduce new dependencies
- Preserve all existing exports and interfaces
- If the fix requires changes to multiple files, focus on the primary fault file only`;

/**
 * SelfHealingEngine — dual-engine autonomous crash repair pipeline.
 *
 * Flow:
 *   1. ErrorCollector provides error context + stack
 *   2. Source file is read from disk
 *   3. GLM-5 and GPT-4.1 analyze in parallel (consensus round)
 *   4. Patches are compared — highest confidence wins; if both agree, confidence amplified
 *   5. Validated patch is written to disk
 *   6. RepoPusher commits and pushes to GitHub
 *   7. Admin notified via Discord DM
 */
class SelfHealingEngine {
  constructor(aiRouter, client) {
    this.router = aiRouter;
    this.client = client;
    this.repoPusher = new RepoPusher();
    this.running = false;
  }

  /**
   * Main entry point — heal a captured error.
   * @param {string} errorId - ID from ErrorCollector
   * @param {Object} opts - { dryRun, notifyUserId }
   */
  async heal(errorId, opts = {}) {
    const { dryRun = false, notifyUserId = process.env.BOT_OWNER_ID } = opts;

    if (this.running) {
      throw new Error('Self-healing pipeline is already running. Please wait.');
    }
    this.running = true;

    const entry = errorCollector.getById(errorId);
    if (!entry) throw new Error(`Error ${errorId} not found in collector`);
    if (entry.resolved) throw new Error(`Error ${errorId} is already resolved`);

    try {
      logger.info(`[SelfHealing] Starting repair pipeline for ${errorId}: ${entry.message}`);

      // Step 1 — Locate source file from stack trace
      const sourceFile = this._extractSourceFile(entry.stack);
      const sourceCode = sourceFile ? this._readFile(sourceFile) : null;

      // Step 2 — Build diagnostic prompt
      const diagMessages = this._buildPrompt(entry, sourceFile, sourceCode);

      // Step 3 — Dual-engine consensus (GLM + GPT in parallel)
      logger.info(`[SelfHealing] Running dual-engine analysis (GLM-5 + GPT-4.1)...`);
      const consensus = await this.router.diagnostic(diagMessages, {
        maxTokens: 3000,
        temperature: 0.1,
      });

      // Step 4 — Parse and compare patches
      const patch = this._selectBestPatch(consensus, entry);
      if (!patch || patch.confidence < 0.5) {
        throw new Error(
          `Confidence too low (${patch?.confidence ?? 0}) — manual intervention required`
        );
      }

      logger.info(`[SelfHealing] Patch selected (confidence: ${patch.confidence}): ${patch.changeDescription}`);

      // Step 5 — Apply patch
      if (!dryRun && patch.fix && patch.affectedFile) {
        const absPath = path.join(PROJECT_ROOT, patch.affectedFile);
        this._writeFile(absPath, patch.fix);
        logger.info(`[SelfHealing] Patch written to ${patch.affectedFile}`);
      }

      // Step 6 — Push to GitHub
      let commitUrl = null;
      if (!dryRun && patch.fix && this.repoPusher.configured) {
        try {
          commitUrl = await this.repoPusher.push({
            filePath: patch.affectedFile,
            content: patch.fix,
            message: `[AutoFix] ${entry.id}: ${patch.changeDescription}`,
          });
          logger.info(`[SelfHealing] Committed: ${commitUrl}`);
        } catch (pushErr) {
          logger.warn(`[SelfHealing] Repo push failed (patch still applied locally): ${pushErr.message}`);
        }
      }

      // Step 7 — Mark resolved & notify admin
      errorCollector.markResolved(errorId, {
        patch: patch.changeDescription,
        confidence: patch.confidence,
        commitUrl,
        dryRun,
      });

      if (notifyUserId) {
        await this._notifyAdmin(notifyUserId, entry, patch, commitUrl, dryRun);
      }

      return { success: true, patch, commitUrl, dryRun };

    } finally {
      this.running = false;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _extractSourceFile(stack) {
    if (!stack) return null;
    // Match lines like: at Object.<anonymous> (/home/runner/workspace/artifacts/goalx-bot/src/...)
    const matches = [...(stack.matchAll(/\((.+\.js):\d+:\d+\)/g))];
    for (const m of matches) {
      const abs = m[1];
      if (abs.includes('node_modules') || abs.includes('node:')) continue;
      if (abs.includes('goalx-bot/src')) {
        // Return relative to project root
        return abs.replace(PROJECT_ROOT + '/', '');
      }
    }
    return null;
  }

  _readFile(relPath) {
    try {
      return fs.readFileSync(path.join(PROJECT_ROOT, relPath), 'utf8');
    } catch {
      return null;
    }
  }

  _writeFile(absPath, content) {
    fs.writeFileSync(absPath, content, 'utf8');
  }

  _buildPrompt(entry, sourceFile, sourceCode) {
    const context = [
      `ERROR ID: ${entry.id}`,
      `TYPE: ${entry.type}`,
      `MESSAGE: ${entry.message}`,
      entry.code ? `CODE: ${entry.code}` : null,
      entry.command ? `COMMAND: /${entry.command}` : null,
      '',
      'STACK TRACE:',
      entry.stack || '(no stack)',
      '',
      sourceFile ? `SOURCE FILE: ${sourceFile}` : 'SOURCE FILE: (could not determine)',
      sourceCode ? `\nSOURCE CODE:\n\`\`\`javascript\n${sourceCode.slice(0, 6000)}\n\`\`\`` : '',
    ].filter(Boolean).join('\n');

    return [
      { role: 'system', content: DIAGNOSTIC_SYSTEM },
      { role: 'user', content: context },
    ];
  }

  _parsePatch(responseText) {
    try {
      // Strip markdown code fences if present
      const cleaned = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const obj = JSON.parse(cleaned);
      return {
        rootCause: obj.rootCause || null,
        affectedFile: obj.affectedFile || null,
        fix: obj.fix || null,
        confidence: typeof obj.confidence === 'number' ? obj.confidence : 0,
        changeDescription: obj.changeDescription || 'No description',
      };
    } catch {
      return null;
    }
  }

  _selectBestPatch(consensus, entry) {
    const glmPatch = consensus.glm ? this._parsePatch(consensus.glm) : null;
    const gptPatch = consensus.gpt ? this._parsePatch(consensus.gpt) : null;

    if (!glmPatch && !gptPatch) {
      logger.warn('[SelfHealing] Both engines returned unparseable responses');
      return null;
    }

    // If both returned patches, use consensus amplification
    if (glmPatch && gptPatch && consensus.consensus) {
      // If they target the same file, average confidence and prefer higher-confidence fix
      if (glmPatch.affectedFile === gptPatch.affectedFile) {
        const avgConf = (glmPatch.confidence + gptPatch.confidence) / 2;
        const best = glmPatch.confidence >= gptPatch.confidence ? glmPatch : gptPatch;
        return { ...best, confidence: Math.min(1.0, avgConf * 1.15), engines: ['glm', 'gpt'] };
      }
    }

    // Pick whichever has higher confidence
    if (glmPatch && gptPatch) {
      return glmPatch.confidence >= gptPatch.confidence
        ? { ...glmPatch, engines: ['glm'] }
        : { ...gptPatch, engines: ['gpt'] };
    }

    const result = glmPatch || gptPatch;
    return result ? { ...result, engines: [glmPatch ? 'glm' : 'gpt'] } : null;
  }

  async _notifyAdmin(userId, entry, patch, commitUrl, dryRun) {
    try {
      const user = await this.client.users.fetch(userId);
      const { EmbedBuilder } = require('discord.js');

      const embed = new EmbedBuilder()
        .setColor(dryRun ? '#FFB344' : '#44FF88')
        .setTitle(`${dryRun ? '🧪 [DRY RUN] ' : '✅ '}AutoFix Complete — ${entry.id}`)
        .addFields(
          { name: '🔴 Error', value: `\`\`\`${entry.message.slice(0, 200)}\`\`\`` },
          { name: '🔍 Root Cause', value: patch.rootCause || 'Analysed — see patch', inline: false },
          { name: '🔧 Fix Applied', value: patch.changeDescription.slice(0, 400) },
          { name: '📂 File', value: patch.affectedFile || 'Unknown', inline: true },
          { name: '🎯 Confidence', value: `${Math.round((patch.confidence || 0) * 100)}%`, inline: true },
          { name: '🤖 Engines', value: (patch.engines || []).join(' + ').toUpperCase() || 'N/A', inline: true },
        )
        .setFooter({ text: commitUrl ? `Commit: ${commitUrl}` : (dryRun ? 'Dry run — no files written' : 'Applied locally') })
        .setTimestamp();

      await user.send({ embeds: [embed] });
      logger.info(`[SelfHealing] Admin ${userId} notified`);
    } catch (notifyErr) {
      logger.warn(`[SelfHealing] Could not notify admin: ${notifyErr.message}`);
    }
  }
}

module.exports = { SelfHealingEngine };