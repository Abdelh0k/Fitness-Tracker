import type { StrengthSession } from '../types';
import { exercisesByMuscle } from './exercises';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'legs'
  | 'glutes'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs';

/** How hard a muscle has been hit over the week. */
export type MuscleTier = 'untrained' | 'maintaining' | 'growing' | 'focus';

export const muscleGroups: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'legs',
  'glutes',
  'biceps',
  'triceps',
  'forearms',
  'abs'
];

export const muscleLabels: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  legs: 'Legs',
  glutes: 'Glutes',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs'
};

/**
 * Rough weekly set targets for growth. These are common training-volume
 * guidelines, not medical advice, and you can train well outside them.
 */
export const weeklySetTargets: Record<MuscleGroup, number> = {
  chest: 14,
  back: 16,
  shoulders: 14,
  legs: 16,
  glutes: 12,
  biceps: 12,
  triceps: 12,
  forearms: 8,
  abs: 12
};

export const tierLabels: Record<MuscleTier, string> = {
  untrained: 'Not trained',
  maintaining: 'Ticking over',
  growing: 'Building',
  focus: 'Going hard'
};

/**
 * Name-based fallback for anything not in the catalogue — custom exercises the
 * user typed, or the short template names like "Bench Press". First rule that
 * matches wins, so the more specific patterns are listed first.
 */
const keywordRules: Array<[RegExp, MuscleGroup]> = [
  // "Triceps Kickback" is caught by the word triceps, so kickback belongs to glutes below.
  [/skull ?crush|triceps|tricep|pushdown|close[- ]grip bench|jm press/i, 'triceps'],
  [/forearm|wrist|grip strength|farmer/i, 'forearms'],
  [/glute|hip thrust|kickback|frog pump/i, 'glutes'],
  // Must beat the biceps rule below, or "Leg Curl" reads as a curl.
  [/calf|calves|abduct|adduct|quad|hamstring|squat|lunge|leg press|leg extension|leg curl|step[- ]?up|deadlift/i, 'legs'],
  [/biceps|bicep|curl|chin[- ]?up/i, 'biceps'],
  [/ab(s|dominal)?\b|crunch|plank|sit[- ]?up|oblique|russian twist|leg raise|hollow|woodchop|pallof/i, 'abs'],
  [/delt|shoulder|overhead press|military press|lateral raise|front raise|upright row|arnold|shrug|face pull/i, 'shoulders'],
  [/lat |lats|pulldown|pull[- ]?up|row\b|rowing|back extension|pullover/i, 'back'],
  // Last rule, so a leftover "... Press" lands on chest only after leg press,
  // overhead press and close-grip bench have all had their turn above.
  [/chest|pec|bench press|fly|flye|push[- ]?up|dips?\b|crossover|press/i, 'chest']
];

const catalogueByName = (() => {
  const map = new Map<string, MuscleGroup>();
  for (const group of muscleGroups) {
    for (const name of exercisesByMuscle[group]) {
      map.set(normalise(name), group);
    }
  }
  return map;
})();

function normalise(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Which muscle an exercise counts towards. Returns null when we genuinely
 * cannot tell, so callers can surface that rather than guessing wrong.
 */
export function muscleForExercise(name: string): MuscleGroup | null {
  if (!name.trim()) return null;
  const exact = catalogueByName.get(normalise(name));
  if (exact) return exact;
  for (const [pattern, group] of keywordRules) {
    if (pattern.test(name)) return group;
  }
  return null;
}

export type MuscleVolume = {
  group: MuscleGroup;
  sets: number;
  target: number;
  tier: MuscleTier;
  /** Sets still needed to reach the top tier; 0 once you're there. */
  setsToFocus: number;
};

export type VolumeMode = 'week' | 'today';

/** A hard session is around this many sets for one muscle. */
export const dailyFocusAt = 9;
const dailyGrowingAt = 5;

export function tierFor(sets: number, target: number): MuscleTier {
  if (sets <= 0) return 'untrained';
  if (sets >= Math.ceil(target * (2 / 3))) return 'focus';
  if (sets >= Math.ceil(target / 3)) return 'growing';
  return 'maintaining';
}

/**
 * A single day is judged on absolute sets, not a slice of the weekly target —
 * dividing a weekly number by the days in a week produces targets a normal
 * session blows straight past.
 */
export function tierForDay(sets: number): MuscleTier {
  if (sets <= 0) return 'untrained';
  if (sets >= dailyFocusAt) return 'focus';
  if (sets >= dailyGrowingAt) return 'growing';
  return 'maintaining';
}

/** Counts only sets that were actually filled in — a blank set row isn't training. */
function completedSets(exercise: { sets: Array<{ weightKg: number; reps: number }> }) {
  return exercise.sets.filter((set) => set.reps > 0).length;
}

/**
 * Tallies sets per muscle across the given sessions. Each exercise credits its
 * primary muscle only; we don't have reliable secondary-mover data, and inventing
 * it would make the numbers look precise while being made up.
 */
export function muscleVolume(sessions: StrengthSession[], mode: VolumeMode = 'week'): Record<MuscleGroup, MuscleVolume> {
  const totals = {} as Record<MuscleGroup, number>;
  for (const group of muscleGroups) totals[group] = 0;

  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const group = muscleForExercise(exercise.name);
      if (!group) continue;
      totals[group] += completedSets(exercise);
    }
  }

  const result = {} as Record<MuscleGroup, MuscleVolume>;
  for (const group of muscleGroups) {
    const sets = totals[group];
    if (mode === 'today') {
      result[group] = {
        group,
        sets,
        target: dailyFocusAt,
        tier: tierForDay(sets),
        setsToFocus: Math.max(0, dailyFocusAt - sets)
      };
      continue;
    }
    const target = weeklySetTargets[group];
    result[group] = {
      group,
      sets,
      target,
      tier: tierFor(sets, target),
      setsToFocus: Math.max(0, Math.ceil(target * (2 / 3)) - sets)
    };
  }
  return result;
}

/** Exercises that were logged but we couldn't attribute to a muscle. */
export function unmappedExercises(sessions: StrengthSession[]) {
  const names = new Set<string>();
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      if (exercise.name.trim() && !muscleForExercise(exercise.name)) names.add(exercise.name.trim());
    }
  }
  return Array.from(names);
}
