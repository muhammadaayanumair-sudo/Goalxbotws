'use strict';

const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', 'src', 'commands');

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

let fixed = 0;
for (const file of walk(COMMANDS_DIR)) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  // Fix the broken pattern introduced by the add-*-buttons scripts:
  //   ],
  //   ,
  //     components: [Row]}
  // becomes:
  //   ],
  //   components: [Row],
  // }
  content = content.replace(
    /(\s*\]\s*,\s*)\n(\s*),\s*\n(\s+)components:\s*\[(\w+)\]\s*\}\s*\);/g,
    (match, embedsEnd, baseIndent, compIndent, rowName) => {
      return `${embedsEnd}\n${compIndent}components: [${rowName}],\n${baseIndent}});`;
    }
  );

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    fixed++;
    console.log(`Fixed: ${path.relative(COMMANDS_DIR, file)}`);
  }
}

console.log(`\nFixed ${fixed} files.`);
