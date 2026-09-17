import assert from 'node:assert/strict';
import test from 'node:test';
import { searchExercises } from './exercises.js';

test('finds exercises by a case-insensitive substring across all muscles', () => {
  const results = searchExercises('bench press');
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.name.toLowerCase().includes('bench press')));
});

test('restricts results to the given muscle group', () => {
  const results = searchExercises('curl', 'biceps');
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.muscle === 'biceps'));
});

test('an unmatched query returns no results', () => {
  assert.deepEqual(searchExercises('this exercise does not exist'), []);
});
