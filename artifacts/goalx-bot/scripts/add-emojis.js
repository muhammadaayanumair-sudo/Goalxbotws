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
  openpack: '🎁',
  sell: '💸',
  trade: '🤝',
  cards: '🃏',
  collection: '🃏',
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
  partner: '🤝',
  setwelcome: '👋',
  injuries: '🏥',
  topscorers: '🥅',
  predictions: '🔮',
  standings: '📊',
  team: '⚽',
  transfers: '🔄',
  profile: '🆔',
  vote: '🗳️',
  about: 'ℹ️',
  botadmin: '🔧',
  collection: '🗃️',
  dashboard: '📊',
  fantasyrank: '🏅',
  transfernews: '📰',
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
  pay: '💸',
  payday: '💰',
  vippack: '💎',
  trivia: '❓',
  vote: '🗳️',
  weekly: '📅',
  withdraw: '🏧',
  work: '💼',
  setwelcome: '👋',
  removechannel: '🗑️',
  setwelcome: '👋',
  setfixtureschannel: '📅',
  setlivechannel: '🔴',
  setgoalchannel: '⚽',
  setnewschannel: '📰',
  settransferchannel: '🔄',
  setlogchannel: '📜',
  settings: '⚙️',
  matchday: '⚽',
};

const keywordMap = {
  'channel': '📢',
  'notification': '🔔',
  'auto-post': '📤',
  'channel': '📺',
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
  'artificial intelligence': '🤖',
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
  'tournament': '🏆',
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
};

function hasEmoji(str) {
  if (!str) return false;
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F680}-\u{1F6FF}\u{1F600}-\u{1F64F}]/u;
  return emojiRegex.test(str);
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
  const trimmed = text.trim();
  if (hasEmoji(trimmed)) return trimmed;
  return `${emoji} ${trimmed}`;
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

  // Find top-level command name
  const nameMatch = content.match(/\.setName\(['"]([^'"]+)['"]\)/);
  const cmdName = nameMatch ? nameMatch[1] : basename;

  // Replace first top-level .setDescription() that isn't already emoji'd
  content = content.replace(/(\.setDescription\(['"])([^'"]+)(['"]\))/, (match, p1, p2, p3) => {
    if (hasEmoji(p2)) return match;
    return `${p1}${ensureEmojiDesc(p2, pickEmoji(cmdName, p2))}${p3}`;
  });

  // Replace subcommand descriptions and option descriptions without emojis
  content = content.replace(/(\.setDescription\(['"])([^'"]+)(['"]\))/g, (match, p1, p2, p3) => {
    if (hasEmoji(p2)) return match;
    return `${p1}${ensureEmojiDesc(p2, pickEmoji(cmdName, p2))}${p3}`;
  });

  // Replace addChoices names without emojis
  content = content.replace(/(\{ name:\s*['"])([^'"]+)(['"]\s*,\s*value:)/g, (match, p1, p2, p3) => {
    if (hasEmoji(p2)) return match;
    return `${p1}${ensureEmojiDesc(p2, pickEmoji(cmdName, p2))}${p3}`;
  });

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changedCount++;
    console.log(`Updated: ${path.relative(COMMANDS_DIR, file)}`);
  }
}

console.log(`\nUpdated ${changedCount} files.`);
