'use strict';

const { EmbedBuilder } = require('discord.js');

const DEFAULT_INTRO_MESSAGE = 'Hey {user}, welcome to **{server}**! 🎉 I\'m GoalX, your football companion. Use `/help` to see what I can do.';

const CHANNEL_PREVIEW = {
  live: {
    color: '#C0392B',
    title: '🔴  GoalX Live Scores Connected!',
    body: '✅ This channel is now set up for **live match score updates**.' +
          '\n\nScore changes and status updates will appear here every 60 seconds during live matches. Example:\n\n' +
          '**Arsenal** `1` — `0` **Chelsea**\n' +
          '─────────────────────────────────\n' +
          '🏆 **Premier League** · England\n' +
          '⏱️ **45\'**  ·  🏟️ Emirates Stadium',
    footer: '⚽ GoalX · Live scores channel configured',
    pingText: 'live updates',
  },
  goals: {
    color: '#FF6B35',
    title: '⚽  GoalX Goals Connected!',
    body: '✅ This channel is now set up for **live goal alerts**.' +
          '\n\nWhen a goal is scored in any live match you\'ll see something like this:\n\n' +
          '**Arsenal** `2` — `1` **Chelsea**\n' +
          '──────────────────────────────────\n' +
          '🏆 **Premier League** · England\n' +
          '⏱️ **67\'**  ·  🏟️ Emirates Stadium',
    footer: '⚽ GoalX · Goals channel configured',
    pingText: 'every goal',
  },
  news: {
    color: '#E74C3C',
    title: '📰  GoalX News Connected!',
    body: '✅ This channel is now set up for **football news auto-posts**.' +
          '\n\nNew headlines will be posted here every 15 minutes. Example:\n\n' +
          '**Kylian Mbappé scores hat-trick as Real Madrid thrash Atletico**\n' +
          '> Real Madrid extended their lead at the top of La Liga...',
    footer: '⚽ GoalX · News channel configured',
    pingText: 'breaking news',
  },
  transfers: {
    color: '#27AE60',
    title: '🔄  GoalX Transfers Connected!',
    body: '✅ This channel is now set up for **transfer news alerts**.' +
          '\n\nTransfer updates will be posted here every 2 hours. Example:\n\n' +
          '⚡ **Breaking:** *Jude Bellingham* linked with a summer return to the Premier League.\n' +
          '> Source: Fabrizio Romano · Reliability: ★★★★★',
    footer: '⚽ GoalX · Transfers channel configured',
    pingText: 'transfer alerts',
  },
  fixtures: {
    color: '#2ECC71',
    title: '📅  GoalX Fixtures Connected!',
    body: '✅ This channel is now set up for **daily fixture announcements**.' +
          '\n\nYou\'ll see today\'s matches posted here every 6 hours, grouped by league — like this:\n\n' +
          '`Arsenal` **vs** `Chelsea`  ·  `15:00`\n' +
          '`Man City` **vs** `Liverpool`  ·  `17:30`',
    footer: '⚽ GoalX · Fixtures channel configured',
    pingText: null,
  },
};

function buildChannelPreviewEmbed(type, role = null) {
  const cfg = CHANNEL_PREVIEW[type];
  if (!cfg) return null;

  let description = cfg.body;
  if (role) {
    description += `\n\n🔔 Will ping ${role} on ${cfg.pingText}.`;
  }

  return new EmbedBuilder()
    .setColor(cfg.color)
    .setTitle(cfg.title)
    .setDescription(description)
    .setFooter({ text: cfg.footer })
    .setTimestamp();
}

function formatPreview(template, user, guild) {
  return template
    .replace(/{user}/g, user.toString())
    .replace(/{username}/g, user.displayName || user.username)
    .replace(/{server}/g, guild.name);
}

module.exports = {
  DEFAULT_INTRO_MESSAGE,
  CHANNEL_PREVIEW,
  buildChannelPreviewEmbed,
  formatPreview,
};
