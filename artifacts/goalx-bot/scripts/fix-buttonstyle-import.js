'use strict';

const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', 'src', 'commands');

let fixed = 0;
let alreadyOk = 0;

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Only touch files that use ButtonStyle
  if (!content.includes('ButtonStyle')) return;

  // Already imported
  if (/require\('discord\.js'\)/.test(content) && content.match(/require\('discord\.js'\)/)?.[0] && content.includes('ButtonStyle')) {
    const importLine = content.match(/const\s*\{[^}]+\}\s*=\s*require\('discord\.js'\)/)?.[0];
    if (importLine && importLine.includes('ButtonStyle')) {
      alreadyOk++;
      return;
    }
  }

  // Add ButtonStyle to existing discord.js import
  const importRegex = /const\s*\{([^}]+)\}\s*=\s*require\('discord\.js'\)/;
  const match = content.match(importRegex);

  if (match) {
    const existing = match[1];
    if (existing.includes('ButtonStyle')) {
      alreadyOk++;
      return;
    }
    // Append ButtonStyle to the destructure list
    const newImport = match[0].replace(
      `{ ${existing.trim()} }`,
      `{ ${existing.trim()}, ButtonStyle }`
    );
    content = content.replace(match[0], newImport);
  } else {
    // No discord.js import at all — prepend one
    content = `const { ButtonStyle } = require('discord.js');\n` + content;
  }

  fs.writeFileSync(filePath, content, 'utf8');
  fixed++;
  console.log(`Fixed: ${path.relative(COMMANDS_DIR, filePath)}`);
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_archived') continue;
      walk(full);
    } else if (entry.name.endsWith('.js')) {
      processFile(full);
    }
  }
}

walk(COMMANDS_DIR);
console.log(`\nFixed ${fixed} files, ${alreadyOk} already had ButtonStyle imported.`);
