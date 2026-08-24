import type {
  BodyMetric,
  CardioEntry,
  MealEntry,
  ProgressPhoto,
  SavedMeal,
  StepEntry,
  StrengthSession,
  TrainingProgram,
  UserProfile
} from '../types';

const prefix = 'ateform:';

export function uid(prefixValue = 'id') {
  return `${prefixValue}-${randomUUID()}`;
}

function randomUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function prettyDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(prefix + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocal<T>(key: string, value: T) {
  localStorage.setItem(prefix + key, JSON.stringify(value));
}

export type LocalState = {
  profile: UserProfile;
  meals: MealEntry[];
  savedMeals: SavedMeal[];
  strength: StrengthSession[];
  programs: TrainingProgram[];
  cardio: CardioEntry[];
  steps: StepEntry[];
  body: BodyMetric[];
  photos: ProgressPhoto[];
};
