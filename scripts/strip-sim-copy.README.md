# Strip Simulation Copy Script

This script removes simulation/demo/backtest related UI text from frontend files.

## Usage

### Dry Run (Preview changes without modifying files)
```bash
node scripts/strip-sim-copy.mjs --dry-run
```

### Apply Changes (Creates .bak backups of modified files)
```bash
node scripts/strip-sim-copy.mjs --apply
```

Or use npm scripts:
```bash
npm run strip:simcopy:dry   # Dry run
npm run strip:simcopy       # Apply changes
```

## What it removes

### Lines containing:
- Simulation/demo/backtest disclaimers
- "Past performance is not indicative of future results"
- "Historical data/candles/prices" warnings
- Demo mode indicators
- Replay/backtest labels

### Inline replacements:
- `Invest (Simulation)` → `Invest`
- `Invest (Demo)` → `Invest`
- Removes `(simulation...)`, `(demo...)`, `(replay...)` suffixes
- Removes "DEMO MODE -", "DEMO DATA -" prefixes

## Files Processed
- `.tsx`, `.jsx`, `.md`, `.html` in frontend directories
- Skips: `node_modules`, `dist`, `.git`, `build`, `coverage`

## Backups
When using `--apply`, each modified file gets a `.bak` backup created alongside it.
