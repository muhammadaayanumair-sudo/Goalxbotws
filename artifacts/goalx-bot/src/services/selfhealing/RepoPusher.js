'use strict';

const { logger } = require('../../utils/logger');

/**
 * RepoPusher — commits and pushes auto-generated patches to GitHub via REST API.
 *
 * Requires:
 *   GITHUB_REPO_TOKEN — PAT with repo write access
 *   GITHUB_REPO_OWNER — e.g. "myorg"
 *   GITHUB_REPO_NAME  — e.g. "goalx-bot"
 *   GITHUB_REPO_BRANCH — defaults to "main"
 */
class RepoPusher {
  constructor() {
    this.token  = process.env.GITHUB_REPO_TOKEN;
    this.owner  = process.env.GITHUB_REPO_OWNER;
    this.repo   = process.env.GITHUB_REPO_NAME;
    this.branch = process.env.GITHUB_REPO_BRANCH || 'main';
    this.configured = Boolean(this.token && this.owner && this.repo);

    if (!this.configured) {
      logger.warn('[RepoPusher] Not fully configured — auto-push disabled. ' +
        'Set GITHUB_REPO_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME to enable.');
    }
  }

  /**
   * Push a patched file to GitHub.
   * @param {Object} opts - { filePath, content, message }
   * @returns {string} URL of the created commit
   */
  async push({ filePath, content, message }) {
    if (!this.configured) throw new Error('RepoPusher not configured');

    const apiBase = `https://api.github.com/repos/${this.owner}/${this.repo}`;
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };

    // Step 1 — Get current file SHA (needed for update)
    let sha = null;
    try {
      const getRes = await fetch(`${apiBase}/contents/${filePath}?ref=${this.branch}`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (getRes.ok) {
        const data = await getRes.json();
        sha = data.sha;
      }
    } catch (err) {
      logger.warn(`[RepoPusher] Could not get file SHA (new file?): ${err.message}`);
    }

    // Step 2 — Commit the patched content
    const body = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch: this.branch,
      ...(sha ? { sha } : {}),
    };

    const putRes = await fetch(`${apiBase}/contents/${filePath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    if (!putRes.ok) {
      const err = await putRes.text().catch(() => putRes.statusText);
      throw new Error(`GitHub API error ${putRes.status}: ${err}`);
    }

    const data = await putRes.json();
    const commitUrl = data.commit?.html_url || `https://github.com/${this.owner}/${this.repo}`;
    logger.info(`[RepoPusher] Pushed to ${this.owner}/${this.repo}@${this.branch}: ${commitUrl}`);
    return commitUrl;
  }

  getStatus() {
    return {
      configured: this.configured,
      owner: this.owner || null,
      repo: this.repo || null,
      branch: this.branch,
    };
  }
}

module.exports = { RepoPusher };
