#!/usr/bin/env node

/**
 * Script to remove simulation/demo/backtest related UI copy from frontend files.
 * Usage:
 *   node scripts/strip-sim-copy.mjs --dry-run   # Preview changes without modifying files
 *   node scripts/strip-sim-copy.mjs --apply     # Apply changes (creates .bak backups)
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isApply = args.includes('--apply') || !isDryRun;

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'build', 'coverage', '.cache', '.next', 'out']);
const EXTENSIONS = new Set(['.tsx', '.jsx', '.md', '.html']);

const PATTERNS_TO_REMOVE_LINES = [
  /backtest(?:-only)?/i,
  /replay/i,
  /historical\s+(?:data|candles|prices)/i,
  /not\s+live/i,
  /not\s+a\s+prediction/i,
  /no\s+guarantee/i,
  /guaranteed\s+profit/i,
  /simulation(?:-only)?/i,
  /paper\s+trading/i,
  /testnet/i,
  /не\s+гарант/i,
  /нет\s+гарант/i,
  /историческ/i,
  /симуляц/i,
  /репле/i,
  /не\s+является\s+прогнозом/i,
];

const INLINE_REPLACEMENTS = [
  [/Invest\s*\(\s*Simulation\s*\)/gi, 'Invest'],
  [/Invest\s*\(\s*Demo\s*\)/gi, 'Invest'],
  [/\s*\(\s*simulation[^)]*\)/gi, ''],
  [/\s*\(\s*demo[^)]*\)/gi, ''],
  [/\s*\(\s*replay[^)]*\)/gi, ''],
  [/Simulation\s+Only/gi, ''],
  [/DEMO\s*MODE\s*-?\s*/gi, ''],
  [/DEMO\s*DATA\s*-?\s*/gi, ''],
  [/DEMO\s*-?\s*/gi, ''],
  [/Demo:\s*/gi, ''],
  [/Simulate\s+Deposit\s*\(\s*Demo\s*\)/gi, 'Simulate Deposit'],
];

const LINES_TO_REMOVE_PATTERNS = [
  /Simulation\s+Only/i,
  /DEMO\s+MODE/i,
  /DEMO\s+DATA/i,
  /past\s+performance\s+is\s+not\s+indicative/i,
  /past\s+results\s+do\s+not\s+guarantee/i,
  /This\s+is\s+a\s+demo\s+simulation/i,
  /This\s+is\s+a\s+simulation/i,
  /Result\s+can\s+be\s+negative.*simulation.*historical/i,
  /Demo\s+mode:\s+Click/i,
  /historical\s+strategy\s+simulations/i,
  /demo:\s+use\s+any/i,
  /Demo:\s+Enter\s+any/i,
  /transparent\s+historical\s+returns/i,
];

function shouldProcessFile(filePath) {
  const ext = path.extname(filePath);
  return EXTENSIONS.has(ext);
}

function isUITextLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('import ') || trimmed.startsWith('export ')) return false;
  if (trimmed.startsWith('//') && !trimmed.includes('"') && !trimmed.includes("'")) return false;
  if (/^const\s+\w+\s*=\s*(?:async\s+)?\(/.test(trimmed)) return false;
  if (/^(?:function|class|interface|type)\s+/.test(trimmed)) return false;
  return true;
}

function shouldRemoveLine(line) {
  if (!isUITextLine(line)) return false;
  
  for (const pattern of LINES_TO_REMOVE_PATTERNS) {
    if (pattern.test(line)) {
      if (line.includes('Badge') && line.includes('Simulation Only')) return true;
      if (line.includes('<span') || line.includes('<p>') || line.includes('<h')) return true;
      if (line.includes('>') && line.includes('<')) return true;
      if (/^\s*[">]/.test(line)) return true;
    }
  }
  return false;
}

function processFileContent(content, filePath) {
  let modified = false;
  let lines = content.split('\n');
  let newLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let skipLine = false;
    
    if (shouldRemoveLine(line)) {
      const hasOpenTag = (line.match(/<[a-zA-Z]/g) || []).length;
      const hasCloseTag = (line.match(/<\/[a-zA-Z]/g) || []).length + (line.match(/\/>/g) || []).length;
      
      if (hasOpenTag === hasCloseTag || line.trim().startsWith('"') || line.trim().startsWith("'") || line.trim().startsWith('>')) {
        skipLine = true;
        modified = true;
      }
    }
    
    if (!skipLine) {
      let newLine = line;
      for (const [pattern, replacement] of INLINE_REPLACEMENTS) {
        const before = newLine;
        newLine = newLine.replace(pattern, replacement);
        if (before !== newLine) modified = true;
      }
      newLines.push(newLine);
    }
  }
  
  let result = newLines.join('\n');
  
  result = result.replace(/\n{3,}/g, '\n\n');
  
  return { content: result, modified };
}

function walkDir(dir, callback) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walkDir(fullPath, callback);
      }
    } else if (entry.isFile() && shouldProcessFile(fullPath)) {
      callback(fullPath);
    }
  }
}

function main() {
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'APPLY'}\n`);
  
  const frontendDirs = ['client', 'frontend', 'web', 'apps/web', 'src/client', 'ui'];
  let searchDirs = [];
  
  for (const dir of frontendDirs) {
    if (fs.existsSync(dir)) {
      searchDirs.push(dir);
    }
  }
  
  if (searchDirs.length === 0) {
    searchDirs = ['.'];
  }
  
  console.log(`Searching in: ${searchDirs.join(', ')}\n`);
  
  const changedFiles = [];
  
  for (const searchDir of searchDirs) {
    walkDir(searchDir, (filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { content: newContent, modified } = processFileContent(content, filePath);
      
      if (modified) {
        changedFiles.push(filePath);
        console.log(`${isDryRun ? 'Would modify' : 'Modified'}: ${filePath}`);
        
        if (isApply && !isDryRun) {
          fs.writeFileSync(filePath + '.bak', content);
          fs.writeFileSync(filePath, newContent);
        }
      }
    });
  }
  
  console.log(`\n${isDryRun ? 'Would modify' : 'Modified'} ${changedFiles.length} file(s)`);
  
  if (changedFiles.length > 0) {
    console.log('\nChanged files:');
    changedFiles.forEach(f => console.log(`  - ${f}`));
  }
}

main();
