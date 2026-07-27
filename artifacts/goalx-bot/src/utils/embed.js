'use strict';

const { EmbedBuilder } = require('discord.js');
const config = require('../config/config');

// ── Discord's hard limits — enforced everywhere so nothing silently fails ──
const LIMITS = {
  TITLE: 256,
  DESCRIPTION: 4096,
  FIELD_NAME: 256,
  FIELD_VALUE: 1024,
  FOOTER: 2048,
  MAX_FIELDS: 25,
};

// ── Single source of truth for every color used across the bot ──
const PALETTE = {
  brand:     config.bot.embedColor   || '#00D4FF',
  success:   config.bot.successColor || '#44FF88',
  error:     config.bot.errorColor   || '#FF4444',
  warning:   config.bot.warningColor || '#FFB344',
  live:      '#FF0000',
  fixture:   '#2ECC71',
  result:    '#2C3E50',
  stats:     '#F1C40F',
  economy:   '#FFD700',
  card:      '#9B59B6',
  ai:        '#7B2FBE',
  news:      '#E74C3C',
  bet:       '#27AE60',
  neutral:   '#95A5A6',
  profile:   '#3498DB', // team/player profile cards
  compare:   '#8E44AD', // head-to-head / comparison embeds
  subs:      '#E67E22', // substitution events
  matchStat: '#2980B9', // detailed match statistics
};

const BRAND_FOOTER = '⚽ Powered by GoalX · Crafted with 💚';

/**
 * Truncates a string to a max length, appending an ellipsis marker
 * so it's obvious content was cut rather than silently dropped.
 */
function clamp(str, max) {
  if (!str) return str;
  const s = String(str);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Builds a footer string from a suffix, respecting Discord's 2048 char limit.
 */
function buildFooter(suffix = null) {
  const text = suffix ? `${BRAND_FOOTER} · ${suffix}` : BRAND_FOOTER;
  return clamp(text, LIMITS.FOOTER);
}

/**
 * EmbedFactory — the single place every Discord embed in GoalX is built.
 *
 * Design goals:
 *  - One color palette (PALETTE) — no hardcoded hex scattered across commands
 *  - Every text field auto-clamped to Discord's real limits
 *  - Field-building helpers so commands stop hand-rolling addFields() arrays
 *  - Every themed builder (.live, .card, .ai, etc.) returns a real EmbedBuilder
 *    so callers can still chain .addFields(), .setThumbnail(), etc. freely
 */
class EmbedFactory {
  // ── Core builder every themed helper below delegates to ──────────────────
  static _build({ color, emoji = '', title = null, description = null, footerSuffix = null, timestamp = true }) {
    const embed = new EmbedBuilder().setColor(color);

    if (title) embed.setTitle(clamp(`${emoji ? `${emoji} ` : ''}${title}`, LIMITS.TITLE));
    if (description) embed.setDescription(clamp(description, LIMITS.DESCRIPTION));
    if (timestamp) embed.setTimestamp();
    embed.setFooter({ text: buildFooter(footerSuffix) });

    return embed;
  }

  /** Neutral brand embed — the default for informational commands. */
  static base(title = null, description = null) {
    return this._build({ color: PALETTE.brand, title, description });
  }

  /** Green success confirmation. */
  static success(title, description = null) {
    return this._build({ color: PALETTE.success, emoji: '✅', title, description });
  }

  /** Red error / failure. Falls back to a friendly default message. */
  static error(title, description = null) {
    return this._build({
      color: PALETTE.error,
      emoji: '❌',
      title,
      description: description || 'An unexpected error occurred. Please try again.',
    });
  }

  /** Orange warning / caution. */
  static warning(title, description = null) {
    return this._build({ color: PALETTE.warning, emoji: '⚠️', title, description });
  }

  /** Grey transient "please wait" embed — no footer/timestamp clutter. */
  static loading(description = 'Fetching data...') {
    return new EmbedBuilder().setColor(PALETTE.neutral).setDescription(`⏳ ${description}`);
  }

  /** Live match embed (red) — auto-notes the 60s refresh cadence. */
  static live(title, description = null) {
    return this._build({ color: PALETTE.live, emoji: '🔴', title, description, footerSuffix: 'Updates every 60s' });
  }

  /** Upcoming fixtures / schedule embed (green). */
  static fixture(title, description = null) {
    return this._build({ color: PALETTE.fixture, emoji: '📅', title, description });
  }

  /** Full-time / completed match result embed (dark slate). No auto-emoji — callers set their own status icon (🔴 FT, 🟡 HT, etc). */
  static result(title, description = null) {
    return this._build({ color: PALETTE.result, title, description });
  }

  /** Rankings / leaderboard / stats embed (gold). */
  static stats(title, description = null) {
    return this._build({ color: PALETTE.stats, title, description });
  }

  /** Economy / coins embed (gold). */
  static economy(title, description = null) {
    return this._build({ color: PALETTE.economy, emoji: '🪙', title, description, footerSuffix: 'Economy' });
  }

  /** Football card embed (purple). */
  static card(title, description = null) {
    return this._build({ color: PALETTE.card, emoji: '🃏', title, description, footerSuffix: 'Cards' });
  }

  /** AI-generated content embed (purple, Groq branding). */
  static ai(title, description = null) {
    return this._build({ color: PALETTE.ai, emoji: '🤖', title, description, footerSuffix: 'Powered by Groq ⚡' });
  }

  /** News article embed (red, NewsAPI branding). */
  static news(title, description = null) {
    return this._build({ color: PALETTE.news, emoji: '📰', title, description, footerSuffix: 'News by NewsAPI.org' });
  }

  /** Matchday summary / daily fixture digest. */
  static matchday(title, description = null) {
    return this._build({ color: PALETTE.fixture, emoji: '🗓️', title, description, footerSuffix: 'Matchday Summary' });
  }

  /** Kickoff / starting XI lineups. */
  static kickoff(title, description = null) {
    return this._build({ color: PALETTE.success, emoji: '🏁', title, description, footerSuffix: 'Kickoff' });
  }

  /** Goal event (red/orange). */
  static goal(title, description = null) {
    return this._build({ color: '#FF6B35', emoji: '⚽', title, description, footerSuffix: 'Goal' });
  }

  /** Red card event. */
  static redcard(title, description = null) {
    return this._build({ color: '#E74C3C', emoji: '🟥', title, description, footerSuffix: 'Red Card' });
  }

  /** Yellow card / second yellow / substitution events. */
  static event(title, description = null) {
    return this._build({ color: PALETTE.warning, emoji: '📋', title, description, footerSuffix: 'Match Event' });
  }

  /** Halftime score update. */
  static halftime(title, description = null) {
    return this._build({ color: PALETTE.stats, emoji: '⏸️', title, description, footerSuffix: 'Halftime' });
  }

  /** Full-time result. */
  static fulltime(title, description = null) {
    return this._build({ color: PALETTE.result, emoji: '🏁', title, description, footerSuffix: 'Full Time' });
  }

  /** Penalty shootout. */
  static penalty(title, description = null) {
    return this._build({ color: PALETTE.bet, emoji: '🎯', title, description, footerSuffix: 'Penalty Shootout' });
  }

  /** Betting embed (green). */
  static bet(title, description = null) {
    return this._build({ color: PALETTE.bet, emoji: '🎰', title, description });
  }

  /** Team/player profile embed (blue). */
  static profile(title, description = null) {
    return this._build({ color: PALETTE.profile, title, description });
  }

  /** Head-to-head / comparison embed (purple). */
  static compare(title, description = null) {
    return this._build({ color: PALETTE.compare, emoji: '⚔️', title, description });
  }

  /** Substitution events embed (orange). */
  static subs(title, description = null) {
    return this._build({ color: PALETTE.subs, title, description });
  }

  /** Detailed match statistics embed (blue). */
  static matchStat(title, description = null) {
    return this._build({ color: PALETTE.matchStat, title, description });
  }

  /** Paginated list embed — appends "Page X of Y" to the footer automatically. */
  static paginated(title, description, page, totalPages) {
    return this._build({ color: PALETTE.brand, title, description, footerSuffix: `Page ${page} of ${totalPages}` });
  }

  // ── Field helpers — stop every command from hand-rolling addFields() ─────

  /**
   * Builds a single field object, clamped to Discord's real limits.
   * Use with embed.addFields(EmbedFactory.field(...)).
   */
  static field(name, value, inline = false) {
    return {
      name: clamp(name || '\u200B', LIMITS.FIELD_NAME),
      value: clamp(value || '\u200B', LIMITS.FIELD_VALUE),
      inline,
    };
  }

  /**
   * Adds up to 25 fields to an embed at once, silently dropping any beyond
   * Discord's limit rather than throwing at send-time.
   */
  static addFields(embed, fields) {
    const safe = fields.slice(0, LIMITS.MAX_FIELDS).map((f) => this.field(f.name, f.value, f.inline));
    return embed.addFields(...safe);
  }

  /**
   * Renders a labelled stat block as "**Label:** value" lines joined by \n,
   * clamped to a single field value. Common pattern across economy/card/stat commands.
   */
  static statBlock(pairs) {
    const lines = pairs
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([label, value]) => `**${label}:** ${value}`);
    return clamp(lines.join('\n'), LIMITS.FIELD_VALUE);
  }

  // ── Exposed for commands that need raw access ─────────────────────────────
  static get palette() { return PALETTE; }
  static get limits() { return LIMITS; }
  static clamp(str, max) { return clamp(str, max); }
}

module.exports = { EmbedFactory, PALETTE, BRAND_FOOTER: BRAND_FOOTER };
