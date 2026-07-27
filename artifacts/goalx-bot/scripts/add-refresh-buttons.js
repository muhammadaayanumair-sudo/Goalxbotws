'use strict';

const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', 'src', 'commands');

const TARGETS = new Set([
  'about', 'achievements', 'balance', 'challenges', 'collection', 'dashboard',
  'duels', 'inventory', 'invite', 'leagues', 'livescores', 'mybets', 'payday',
  'ping', 'profile', 'rank', 'server', 'setfixtureschannel', 'shop', 'status',
  'streak', 'transfernews', 'transfers', 'user', 'vippack', 'vote', 'weekly', 'work',
]);

function findCommandFile(name) {
  for (const entry of fs.readdirSync(COMMANDS_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const candidate = path.join(COMMANDS_DIR, entry.name, `${name}.js`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function getCommandName(content) {
  const match = content.match(/\.setName\(['"]([^'"]+)['"]\)/);
  return match ? match[1] : null;
}

function findMatchingBrace(text, openIndex) {
  let depth = 1;
  let i = openIndex + 1;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    i++;
  }
  return i - 1;
}

function addRefreshButton(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  const commandName = getCommandName(content);
  if (!commandName) return false;

  // Check if already has refresh: customId
  if (content.includes(`refresh:${commandName}`)) return false;

  // Find the first interaction.reply or interaction.editReply call
  const regex = /(await\s+interaction\.(reply|editReply)\s*\()\s*(\{)/;
  const match = regex.exec(content);
  if (!match) return false;

  const callStart = match.index;
  const openBrace = match.index + match[0].length - 1;
  const closeBrace = findMatchingBrace(content, openBrace);
  if (closeBrace <= openBrace) return false;

  // Check if the object already has components
  const objectText = content.slice(openBrace, closeBrace + 1);
  if (/components\s*:/.test(objectText)) return false;

  // Build the refresh row code
  const needsImport = !content.includes('ActionRowBuilder') || !content.includes('ButtonBuilder');
  const rowCode = `
      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('refresh:${commandName}')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
`;

  // Insert row code before the await call
  const beforeCall = content.slice(0, callStart);
  const afterCall = content.slice(callStart);
  content = beforeCall + rowCode + afterCall;

  // Recalculate closeBrace after insertion
  const newOpenBrace = callStart + rowCode.length + match[0].length - 1;
  const newCloseBrace = findMatchingBrace(content, newOpenBrace);

  // Insert components: [refreshRow] before the closing brace
  content = content.slice(0, newCloseBrace) + ',\n        components: [refreshRow]' + content.slice(newCloseBrace);

  // Add imports if needed
  if (needsImport) {
    const discordImport = "const { SlashCommandBuilder";
    const newImport = "const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder";
    if (content.includes(discordImport) && !content.includes(newImport)) {
      content = content.replace(discordImport, newImport);
    } else if (!content.includes('ActionRowBuilder')) {
      // Fallback: add import after 'use strict'
      content = content.replace("'use strict';\n", "'use strict';\n\nconst { ActionRowBuilder, ButtonBuilder } = require('discord.js');\n");
    }
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

let updated = 0;
let failed = [];

for (const name of TARGETS) {
  const file = findCommandFile(name);
  if (!file) {
    failed.push(`${name}: file not found`);
    continue;
  }
  try {
    if (addRefreshButton(file)) {
      console.log(`Updated: ${path.relative(COMMANDS_DIR, file)}`);
      updated++;
    } else {
      console.log(`Skipped: ${path.relative(COMMANDS_DIR, file)}`);
    }
  } catch (err) {
    failed.push(`${name}: ${err.message}`);
  }
}

console.log(`\nUpdated ${updated} files.`);
if (failed.length) {
  console.log('Failed:', failed);
}
