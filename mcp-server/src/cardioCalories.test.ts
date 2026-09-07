import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateCardioCalories } from './cardioCalories.js';

test('treadmill walking uses the ACSM walking equation below the run crossover', () => {
  // speed=5km/h (below the 8km/h walk/run cutover), flat, 70kg, 30min.
  assert.equal(estimateCardioCalories({ machine: 'treadmill', weightKg: 70, minutes: 30, speedKmh: 5 }), 124);
});

test('treadmill running uses the running equation at/above the crossover', () => {
  const walk = estimateCardioCalories({ machine: 'treadmill', weightKg: 70, minutes: 30, speedKmh: 7.9 })!;
  const run = estimateCardioCalories({ machine: 'treadmill', weightKg: 70, minutes: 30, speedKmh: 8 })!;
  assert.ok(run > walk, 'crossing into the running formula should not produce a lower estimate');
});

test('treadmill with no speed cannot be estimated', () => {
  assert.equal(estimateCardioCalories({ machine: 'treadmill', weightKg: 70, minutes: 30 }), null);
});

test('bike falls back to the effort-level MET when watts are omitted', () => {
  // low = 3.0 METs: kcal = 3.0*3.5*70kg*30min/200 = 110.25 -> 110
  assert.equal(estimateCardioCalories({ machine: 'bike', weightKg: 70, minutes: 30, cyclingEffort: 'low' }), 110);
});

test('bike prefers a real watts reading over the effort-level fallback', () => {
  const withWatts = estimateCardioCalories({ machine: 'bike', weightKg: 70, minutes: 30, watts: 150 })!;
  const withEffort = estimateCardioCalories({ machine: 'bike', weightKg: 70, minutes: 30, cyclingEffort: 'hard' })!;
  assert.notEqual(withWatts, withEffort, 'the continuous formula and the discrete effort bucket should not coincidentally collapse to the same code path being untested');
});

test('elliptical and ski erg use their fixed Compendium MET regardless of other inputs', () => {
  assert.equal(estimateCardioCalories({ machine: 'elliptical', weightKg: 80, minutes: 45 }), Math.round((5.0 * 3.5 * 80 * 45) / 200));
  assert.equal(estimateCardioCalories({ machine: 'ski_erg', weightKg: 80, minutes: 45 }), Math.round((7.0 * 3.5 * 80 * 45) / 200));
});

test('more weight or more time never decreases the estimate', () => {
  const base = estimateCardioCalories({ machine: 'rowing', weightKg: 70, minutes: 20, rowingEffort: 'medium' })!;
  const heavier = estimateCardioCalories({ machine: 'rowing', weightKg: 90, minutes: 20, rowingEffort: 'medium' })!;
  const longer = estimateCardioCalories({ machine: 'rowing', weightKg: 70, minutes: 40, rowingEffort: 'medium' })!;
  assert.ok(heavier > base);
  assert.ok(longer > base);
});

test('missing weight or minutes cannot be estimated for any machine', () => {
  assert.equal(estimateCardioCalories({ machine: 'elliptical', weightKg: 0, minutes: 30 }), null);
  assert.equal(estimateCardioCalories({ machine: 'elliptical', weightKg: 70, minutes: 0 }), null);
});
