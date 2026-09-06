// Compares a fresh eval run's scores against the most recent saved run —
// this before/after diff is the actual point of building evals. Also gates
// on that comparison (and on optional absolute thresholds) so the eval
// scripts can exit non-zero in CI and actually block a regression, not just
// print one.

import { readdir, readFile } from 'fs/promises'
import path from 'path'

// how much worse a metric can get vs. the previous run before it's a regression,
// not just LLM-judge / retrieval noise
const DEFAULT_REGRESSION_TOLERANCE = 0.02

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

// optional { [metricKey]: minimumValue } floor for an eval type, from evals/thresholds.json —
// e.g. { "retrieval": { "hit_rate": 0.8 }, "generation": { "faithful_rate": 0.8 } }.
// Missing file/key means "no floor configured" rather than a failure.
async function loadThresholds(evalsDir, evalType) {
   let raw;
   try {
      raw = await readFile(path.join(evalsDir, 'thresholds.json'), 'utf-8')
   } catch {
      return null;
   }
   return JSON.parse(raw)[evalType] ?? null;
}

function formatValue(value, decimals) {
   return typeof value === 'number' ? value.toFixed(decimals) : String(value);
}

// metrics whose current value fell further than `tolerance` below the previous run
function findRegressions(previousRun, currentScores, metrics, tolerance = DEFAULT_REGRESSION_TOLERANCE) {
   if (!previousRun) return [];

   const regressions = []
   for (const metric of metrics) {
      const { key, higherIsBetter } = metric
      const current = currentScores[key]
      const previous = previousRun.scores?.[key]
      if (typeof current !== 'number' || typeof previous !== 'number') continue;

      const delta = current - previous
      const gotWorse = higherIsBetter ? delta < -tolerance : delta > tolerance
      if (gotWorse) regressions.push({ ...metric, current, previous, delta });
   }
   return regressions;
}

// metrics whose current value misses the configured minimum for this eval type
function findThresholdFailures(currentScores, metrics, thresholds) {
   if (!thresholds) return [];

   const failures = []
   for (const metric of metrics) {
      const { key, higherIsBetter } = metric
      const minimum = thresholds[key]
      const current = currentScores[key]
      if (minimum === undefined || typeof current !== 'number') continue;

      const failsThreshold = higherIsBetter ? current < minimum : current > minimum
      if (failsThreshold) failures.push({ ...metric, current, minimum });
   }
   return failures;
}

// prints the gate result and returns whether the run passed — call this last so
// main() can process.exit(1) on failure and actually block a bad change in CI
function printGate({ regressions, thresholdFailures }) {
   if (regressions.length === 0 && thresholdFailures.length === 0) {
      console.log('\nGate: PASS')
      return true;
   }

   console.log('\nGate: FAIL')
   for (const { label, current, previous, delta, decimals } of regressions) {
      const sign = delta > 0 ? '+' : ''
      console.log(`  Regression — ${label}: ${formatValue(current, decimals)} (was ${formatValue(previous, decimals)}, ${sign}${formatValue(delta, decimals)})`)
   }
   for (const { label, current, minimum, decimals } of thresholdFailures) {
      console.log(`  Below threshold — ${label}: ${formatValue(current, decimals)} (minimum ${formatValue(minimum, decimals)})`)
   }
   return false;
}

export { loadPreviousRun, printComparison, loadThresholds, findRegressions, findThresholdFailures, printGate }
