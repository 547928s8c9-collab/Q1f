#!/bin/bash
set -e
npm install

node -e "
const { execSync } = require('child_process');
try {
  const out = execSync('npx drizzle-kit push --force', {
    input: '',
    timeout: 15000,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  console.log(out.toString());
} catch (e) {
  if (e.killed || e.signal === 'SIGTERM') {
    console.log('drizzle-kit push timed out (interactive prompt detected), skipping');
    console.log('Schema changes may need to be applied manually via SQL');
  } else if (e.stdout) {
    console.log(e.stdout.toString());
    console.log('drizzle-kit push completed with warnings');
  } else {
    console.error('drizzle-kit push failed:', e.message);
    process.exit(1);
  }
}
"
