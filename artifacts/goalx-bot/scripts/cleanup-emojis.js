'use strict';

const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', 'src', 'commands');

const emojiMap = {
  matchday: '⚽',
  setfixtureschannel: '📅',
  setgoalchannel: '⚽',
  setlivechannel: '🔴',
  setlogchannel: '📜',
  setnewschannel: '📰',
  settings: '⚙️',
  settransferchannel: '🔄',
  removechannel: '🗑️',
  bio: '📝',
  explain: '💡',
  formguide: '📈',
  keyplayers: '🌟',
  ask: '🤖',
  accept: '✅',
  bet: '🎲',
  challenge: '⚔️',
  duel: '⚔️',
  duels: '⚔️',
  card: '🃏',
  cards: '🃏',
  collection: '🃏',
  openpack: '🎁',
  sell: '💸',
  trade: '🤝',
  balance: '💰',
  daily: '📅',
  deposit: '🏦',
  pay: '💸',
  rank: '🏆',
  shop: '🛒',
  weekly: '📅',
  withdraw: '🏧',
  work: '💼',
  achievements: '🏅',
  challenges: '🎯',
  club: '🏟️',
  kickoff: '🏟️',
  tournament: '🏆',
  fixtures: '📅',
  results: '📋',
  compareplayer: '⚖️',
  favorite: '⭐',
  form: '📊',
  headtohead: '⚔️',
  history: '📜',
  league: '🏆',
  lineup: '🧩',
  livematch: '🔴',
  matchstats: '📈',
  nextmatch: '⏭️',
  inventory: '🎒',
  leagues: '🌍',
  livescores: '🔴',
  admin: '🛡️',
  botadmin: '🔧',
  partner: '🤝',
  setwelcome: '👋',
  injuries: '🏥',
  topscorers: '🥅',
  predictions: '🔮',
  standings: '📊',
  team: '⚽',
  transfernews: '📰',
  transfers: '🔄',
  profile: '🆔',
  vote: '🗳️',
  about: 'ℹ️',
  dashboard: '📊',
  fantasyrank: '🏅',
  contract: '📄',
  contracts: '📄',
  shootout: '🥅',
  user: '👤',
  server: '🖥️',
  status: '✅',
  ping: '📡',
  myteam: '👕',
  mybets: '🎰',
  stadium: '🏟️',
  squad: '👥',
  player: '👤',
  globalevent: '🌍',
  guildwar: '⚔️',
  leaderboard: '🏆',
  analyze: '🧠',
  invite: '🤖',
  market: '🏪',
  auction: '🔨',
  news: '📰',
  live: '🔴',
  help: '❓',
  tactics: '📋',
  payday: '💰',
  vippack: '💎',
  trivia: '❓',
  scout: '🔍',
  matchpreview: '🔮',
  matchday: '⚽',
  recents: '🕐',
  mod: '🛡️',
};

const keywordMap = {
  'channel': '📢',
  'notification': '🔔',
  'auto-post': '📤',
  'goal': '⚽',
  'news': '📰',
  'transfer': '🔄',
  'fixture': '📅',
  'live': '🔴',
  'log': '📜',
  'admin': '🛡️',
  'owner': '👑',
  'partner': '🤝',
  'welcome': '👋',
  'remove': '🗑️',
  'settings': '⚙️',
  'AI': '🤖',
  'explain': '💡',
  'biography': '📝',
  'form': '📊',
  'key players': '🌟',
  'ask': '❓',
  'bet': '🎲',
  'duel': '⚔️',
  'challenge': '⚔️',
  'prediction': '🔮',
  'card': '🃏',
  'pack': '🎁',
  'sell': '💸',
  'trade': '🤝',
  'balance': '💰',
  'coins': '🪙',
  'daily': '📅',
  'weekly': '📅',
  'deposit': '🏦',
  'withdraw': '🏧',
  'pay': '💸',
  'work': '💼',
  'shop': '🛒',
  'rank': '🏆',
  'level': '⭐',
  'achievement': '🏅',
  'challenge': '🎯',
  'club': '🏟️',
  'kickoff': '🏟️',
  'fixtures': '📅',
  'results': '📋',
  'compare': '⚖️',
  'favorite': '⭐',
  'history': '📜',
  'head to head': '⚔️',
  'league': '🏆',
  'lineup': '🧩',
  'match': '⚽',
  'stats': '📈',
  'next': '⏭️',
  'inventory': '🎒',
  'injuries': '🏥',
  'top scorers': '🥅',
  'standings': '📊',
  'team': '⚽',
  'transfers': '🔄',
  'profile': '🆔',
  'vote': '🗳️',
  'about': 'ℹ️',
  'dashboard': '📊',
  'stadium': '🏟️',
  'scout': '🔍',
  'matchpreview': '🔮',
  'trivia': '❓',
  'mod': '🛡️',
};

function hasLeadingEmojiLike(str) {
  if (!str) return false;
  const first = str.trim().codePointAt(0);
  if (!first) return false;
  // Treat any non-ASCII starting character (codepoint > 127) as an emoji-like prefix
  return first > 127;
}

function stripLeadingEmojiLike(str) {
  let s = str.trim();
  // Strip all leading non-ASCII characters and spaces (one or more emoji-like prefixes)
  while (s.length > 0) {
    const cp = s.codePointAt(0);
    if (cp > 127) {
      // Handle emoji with variation selectors (U+FE0F) and zero-width joiners (U+200D)
      let i = 1;
      while (i < s.length) {
        const c = s.codePointAt(i);
        if (c === 0xFE0F || c === 0x200D || (c >= 0x1F3FB && c <= 0x1F3FF)) {
          i++;
          continue;
        }
        break;
      }
      s = s.slice(i).trim();
    } else if (s[0] === ' ') {
      s = s.slice(1).trim();
    } else {
      break;
    }
  }
  return s.trim();
}

function pickEmoji(name, desc) {
  if (emojiMap[name]) return emojiMap[name];
  const lowerDesc = (desc || '').toLowerCase();
  for (const [kw, em] of Object.entries(keywordMap)) {
    if (lowerDesc.includes(kw.toLowerCase())) return em;
  }
  return '⚽';
}

function ensureEmojiDesc(text, emoji) {
  const stripped = stripLeadingEmojiLike(text);
  return `${emoji} ${stripped}`;
}

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_archived') continue;
      results.push(...walk(fullPath));
    } else if (entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walk(COMMANDS_DIR);
let changedCount = 0;

for (const file of files) {
  const basename = path.basename(file, '.js');
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  const nameMatch = content.match(/\.setName\(['"]([^'"]+)['"]\)/);
  const cmdName = nameMatch ? nameMatch[1] : basename;

  // Replace top-level .setDescription() (the first occurrence)
  let first = true;
  content = content.replace(/(\.setDescription\(['"])([^'"]+)(['"]\))/g, (match, p1, p2, p3) => {
    const cleaned = stripLeadingEmojiLike(p2);
    if (first) {
      first = false;
      return `${p1}${ensureEmojiDesc(cleaned, pickEmoji(cmdName, cleaned))}${p3}`;
    }
    // For subcommand/option descriptions, pick emoji by keyword if not already present
    const em = pickEmoji(cmdName, cleaned);
    return `${p1}${ensureEmojiDesc(cleaned, em)}${p3}`;
  });

  // Replace addChoices names
  content = content.replace(/(\{ name:\s*['"])([^'"]+)(['"]\s*,\s*value:)/g, (match, p1, p2, p3) => {
    const cleaned = stripLeadingEmojiLike(p2);
    const em = pickEmoji(cmdName, cleaned);
    return `${p1}${ensureEmojiDesc(cleaned, em)}${p3}`;
  });

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedCount++;
  }
}

console.log(`Cleaned up emojis in ${changedCount} files.`);
