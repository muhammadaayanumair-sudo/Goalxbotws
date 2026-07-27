'use strict';
/**
 * For commands that already have a try-catch but call deferReply() BEFORE it,
 * this script moves deferReply() inside the try block.
 *
 * Pattern it handles:
 *   async execute(...) {
 *     await interaction.deferReply(...);   ← outside try
 *     const api = ...;
 *     try { ... } catch { ... }
 *   }
 *
 * Becomes:
 *   async execute(...) {
 *     try {
 *       await interaction.deferReply(...);
 *       const api = ...;
 *       ...
 *     } catch (err) {
 *       ...
 *       // plus safe error reply
 *     }
 *   }
 */
const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '../src/commands');

const CATCH_TAIL = `  } catch (error) {
    const isExpiredInteraction = error.code === 10062;
    if (!isExpiredInteraction) {
      logger.error(\`[\${interaction.commandName}] execute error:\`, error);
    }
    try {
      const msg = {
        embeds: [EmbedFactory.error('Something went wrong', error.message || 'An unexpected error occurred.')],
        flags: 64,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else if (!isExpiredInteraction) {
        await interaction.reply(msg);
      }
    } catch (_) { /* interaction already expired */ }
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

function hasDeferBeforeTry(src) {
  const execMatch = src.match(/async execute\s*\([^)]*\)\s*\{/);
  if (!execMatch) return false;
  const bodyStart = src.indexOf(execMatch[0]) + execMatch[0].length;
  const body = src.slice(bodyStart);
  const tryPos = body.indexOf('try {');
  const deferPos = body.indexOf('deferReply');
  return deferPos !== -1 && (tryPos === -1 || deferPos < tryPos);
}

function ensureImport(src, importLine, check) {
  if (src.includes(check)) return src;
  const lines = src.split('\n');
  let lastReqIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    if (lines[i].trim().startsWith('const ') && lines[i].includes('require(')) {
      lastReqIdx = i;
    }
  }
  const at = lastReqIdx >= 0 ? lastReqIdx + 1 : 1;
  lines.splice(at, 0, importLine);
  return lines.join('\n');
}

/**
 * Finds the execute function body, removes any existing top-level try-catch
 * wrapper if it was placed there (our previous patch), and re-wraps everything
 * from the first line all the way to the matching close brace in a single try-catch.
 */
function rewrapExecute(src, filePath) {
  const execRe = /(\s*async execute\s*\([^)]*\)\s*\{)/;
  const execMatch = src.match(execRe);
  if (!execMatch) return src;

  const execStart = src.indexOf(execMatch[0]);
  const bodyStart = execStart + execMatch[0].length;

  // Find matching closing brace of execute()
  let depth = 1;
  let i = bodyStart;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  const closingBracePos = i - 1;
  const bodyContent = src.slice(bodyStart, closingBracePos);

  // If it already starts with try { (our prior patch), strip that wrapper first
  const trimmedBody = bodyContent.trimStart();
  let innerBody;
  if (trimmedBody.startsWith('try {')) {
    // Find end of the try { ... } catch { ... } block
    // We'll just use the whole body as-is and re-wrap — but we need to avoid double-wrapping.
    // Simplest: check if the ENTIRE body is one try-catch (i.e. no code after the catch)
    // For now, just use the whole body content as the inner body to re-wrap.
    // Strip the outer try { ... } catch { ... } added by our previous script
    const tryCatchRe = /^\s*try \{([\s\S]*?)\} catch \(error\) \{[\s\S]*try \{[\s\S]*\} catch \(_\) \{[^}]*\}\s*\}\s*$/;
    const m = tryCatchRe.exec(bodyContent);
    if (m) {
      innerBody = m[1];
    } else {
      innerBody = bodyContent;
    }
  } else {
    innerBody = bodyContent;
  }

  // Indent inner body by 2 more spaces
  const indented = innerBody
    .split('\n')
    .map((line) => (line.trim() === '' ? line : '  ' + line))
    .join('\n');

  const newBody = `\n  try {${indented}${CATCH_TAIL}\n`;
  return src.slice(0, bodyStart) + newBody + src.slice(closingBracePos);
}

const files = getAllJsFiles(COMMANDS_DIR);
let patched = 0;

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');

  if (!hasDeferBeforeTry(src)) continue;

  console.log(`Fixing: ${path.relative(COMMANDS_DIR, file)}`);

  src = ensureImport(src, "const { logger } = require('../../utils/logger');", "require('../../utils/logger')");
  src = ensureImport(src, "const { EmbedFactory } = require('../../utils/embed');", 'EmbedFactory');
  src = rewrapExecute(src, file);

  fs.writeFileSync(file, src, 'utf8');
  patched++;
}

console.log(`\nDone. Patched ${patched} files with deferReply-before-try.`);
