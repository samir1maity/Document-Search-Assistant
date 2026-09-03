// Compares a fresh eval run's scores against the most recent saved run —
// this before/after diff is the actual point of building evals.

import { readdir, readFile } from 'fs/promises'
import path from 'path'

// most recent previously-saved run for this eval type, or null if none exists yet
async function loadPreviousRun(resultsDir, prefix) {
   let files;
   try {
      files = await readdir(resultsDir)
   } catch {
      return null;
   }

   const matching = files.filter(file => file.startsWith(prefix) && file.endsWith('.json')).sort()
   if (matching.length === 0) return null;

   const previousFile = matching[matching.length - 1]
   const raw = await readFile(path.join(resultsDir, previousFile), 'utf-8')
   return { file: previousFile, ...JSON.parse(raw) };
}

function formatDelta(current, previous, { higherIsBetter, decimals }) {
   if (current === null || current === undefined || previous === null || previous === undefined) {
      return '(no baseline)';
   }

   const delta = current - previous
   if (Math.abs(delta) < 10 ** -decimals) return 'no change';

   const arrow = (delta > 0) === higherIsBetter ? '▲' : '▼'
   const sign = delta > 0 ? '+' : ''
   return `${arrow} ${sign}${delta.toFixed(decimals)} (was ${previous.toFixed(decimals)})`;
}

// metrics: [{ key, label, higherIsBetter, decimals }]
function printComparison(previousRun, currentScores, metrics) {
   if (!previousRun) {
      console.log('\n(No previous run saved yet — this becomes the baseline for next time.)')
      return;
   }

   console.log(`\nCompared to previous run (${previousRun.file}):`)
   for (const { key, label, higherIsBetter, decimals } of metrics) {
      console.log(`  ${label}: ${formatDelta(currentScores[key], previousRun.scores?.[key], { higherIsBetter, decimals })}`)
   }
}

export { loadPreviousRun, printComparison }
