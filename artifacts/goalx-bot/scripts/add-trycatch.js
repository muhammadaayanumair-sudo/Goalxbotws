'use strict';
/**
 * Adds try-catch error handling to execute() functions that are missing it.
 * Injects a logger require if not present.
 * Run: node scripts/add-trycatch.js
 */
const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '../src/commands');

const CATCH_BLOCK = `  } catch (error) {
    logger.error(\`[\${interaction.commandName}] execute error:\`, error);
    const msg = {
      embeds: [EmbedFactory.error('Something went wrong', error.message || 'An unexpected error occurred. Please try again.')],
      ephemeral: true,
    };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch (_) { /* interaction already timed out */ }
  }`;

function getAllJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '_archived') results.push(...getAllJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

function ensureLoggerImport(src) {
  if (src.includes("require('../../utils/logger')") || src.includes('require("../../utils/logger")')) {
    return src;
  }
  // Insert after the last require line near the top
  const lines = src.split('\n');
  let lastRequireIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    if (lines[i].trim().startsWith('const ') && lines[i].includes('require(')) {
      lastRequireIdx = i;
    }
  }
  const insertAt = lastRequireIdx >= 0 ? lastRequireIdx + 1 : 1;
  lines.splice(insertAt, 0, "const { logger } = require('../../utils/logger');");
  return lines.join('\n');
}

function ensureEmbedFactoryImport(src) {
  if (src.includes('EmbedFactory')) return src; // already imported
  const lines = src.split('\n');
  let lastRequireIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    if (lines[i].trim().startsWith('const ') && lines[i].includes('require(')) {
      lastRequireIdx = i;
    }
  }
  const insertAt = lastRequireIdx >= 0 ? lastRequireIdx + 1 : 1;
  lines.splice(insertAt, 0, "const { EmbedFactory } = require('../../utils/embed');");
  return lines.join('\n');
}

function wrapExecuteInTryCatch(src, filePath) {
  // Find the execute function's opening brace
  const execMatch = src.match(/(\s*async execute\s*\([^)]*\)\s*\{)/);
  if (!execMatch) {
    console.log(`  SKIP: no execute() found in ${path.basename(filePath)}`);
    return src;
  }

  const execStart = src.indexOf(execMatch[0]);
  const bodyStart = execStart + execMatch[0].length;

  // Walk forward to find the matching closing brace for execute()
  let depth = 1;
  let i = bodyStart;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  // i is now just past the closing }
  const closingBracePos = i - 1; // position of the }

  const bodyContent = src.slice(bodyStart, closingBracePos);

  // Check if body already has try { at the top level (depth-0)
  // Simple check: does the trimmed body start with 'try {'
  if (bodyContent.trimStart().startsWith('try {')) {
    console.log(`  SKIP: already has try-catch in ${path.basename(filePath)}`);
    return src;
  }

  // Indent body by 2 more spaces
  const indentedBody = bodyContent
    .split('\n')
    .map((line) => (line.trim() === '' ? line : '  ' + line))
    .join('\n');

  const newBody = `\n  try {${indentedBody}${CATCH_BLOCK}\n`;

  const newSrc = src.slice(0, bodyStart) + newBody + src.slice(closingBracePos);
  return newSrc;
}

const files = getAllJsFiles(COMMANDS_DIR);
let patched = 0;
let skipped = 0;

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');

  if (src.includes('try {')) {
    skipped++;
    continue;
  }

  console.log(`Patching: ${path.relative(COMMANDS_DIR, file)}`);

  src = ensureLoggerImport(src);
  src = ensureEmbedFactoryImport(src);
  src = wrapExecuteInTryCatch(src, file);

  fs.writeFileSync(file, src, 'utf8');
  patched++;
}

console.log(`\nDone. Patched: ${patched}, Skipped (already had try-catch): ${skipped}`);
