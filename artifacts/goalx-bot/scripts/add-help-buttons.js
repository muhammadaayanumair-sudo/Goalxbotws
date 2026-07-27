'use strict';

const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', 'src', 'commands');

const TARGETS = new Set([
  'accept', 'admin', 'analyze', 'ask', 'bet', 'bio', 'botadmin', 'card', 'club',
  'deposit', 'explain', 'formguide', 'headtohead', 'keyplayers', 'matchday',
  'matchpreview', 'partner', 'pay', 'removechannel', 'scout', 'sell', 'setgoalchannel',
  'setlivechannel', 'setlogchannel', 'setnewschannel', 'settings', 'settransferchannel',
  'setwelcome', 'tactics', 'tournament', 'withdraw',
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

function addHelpButton(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  const commandName = getCommandName(content);
  if (!commandName) return false;

  // Skip if already has any button (to avoid duplicate help buttons)
  if (content.includes('setCustomId')) return false;

  // Find the first interaction.reply or interaction.editReply call
  const regex = /(await\s+interaction\.(reply|editReply)\s*\()\s*(\{)/;
  const match = regex.exec(content);
  if (!match) return false;

  const callStart = match.index;
  const openBrace = callStart + match[0].length - 1;
  const closeBrace = findMatchingBrace(content, openBrace);
  if (closeBrace <= openBrace) return false;

  // Check if the object already has components
  const objectText = content.slice(openBrace, closeBrace + 1);
  if (/components\s*:/.test(objectText)) return false;

  // Determine indentation of the await line
  const linesBefore = content.slice(0, callStart).split('\n');
  const awaitLine = linesBefore[linesBefore.length - 1];
  const baseIndent = awaitLine.match(/^(\s*)/)?.[1] || '      ';
  const innerIndent = baseIndent + '  ';

  const rowCode = `${baseIndent}const helpRow = new ActionRowBuilder().addComponents(\n${innerIndent}new ButtonBuilder()\n${innerIndent}  .setCustomId('help:${commandName}')\n${innerIndent}  .setLabel('❓ Help')\n${innerIndent}  .setStyle(ButtonStyle.Secondary)\n${baseIndent});\n\n${baseIndent}`;

  // Insert row code before the await call
  const beforeCall = content.slice(0, callStart);
  const afterCall = content.slice(callStart);
  content = beforeCall + rowCode + afterCall;

  // Recalculate closeBrace after insertion
  const newOpenBrace = callStart + rowCode.length + match[0].length - 1;
  const newCloseBrace = findMatchingBrace(content, newOpenBrace);

  // Insert components: [helpRow] before the closing brace, on its own line
  const insert = `,\n${innerIndent}components: [helpRow]`;
  content = content.slice(0, newCloseBrace) + insert + content.slice(newCloseBrace);

  // Add imports if needed
  if (!content.includes('ActionRowBuilder') || !content.includes('ButtonBuilder')) {
    const discordImport = "const { SlashCommandBuilder";
    const newImport = "const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder";
    if (content.includes(discordImport) && !content.includes(newImport)) {
      content = content.replace(discordImport, newImport);
    } else if (!content.includes('ActionRowBuilder')) {
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
    if (addHelpButton(file)) {
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
