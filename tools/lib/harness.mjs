/* Skewbiks.com — the shared micro test harness.
 *
 * Deliberately NOT a framework (CLAUDE.md: no unit-test framework): a name, a
 * function, two counters. t() runs the test immediately — throwing or
 * returning false fails it; finish() prints the tally and sets the exit code.
 * Used by tools/test-engine.mjs, tools/test-solver.mjs, tools/test-trainer.mjs.
 */
let passed = 0, failed = 0;

export function t(name, fn) {
  try {
    const r = fn();
    if (r === false) throw new Error('assertion returned false');
    console.log('✓ ' + name); passed++;
  } catch (e) {
    console.log('✗ ' + name + '\n    ' + (e && e.message)); failed++;
  }
}

export function finish() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

export const rndInt = n => Math.floor(Math.random() * n);
