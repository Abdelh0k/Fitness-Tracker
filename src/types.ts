export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type Goal = 'fat_loss' | 'recomp' | 'muscle_gain' | 'maintain';
export type ActivityLevel = 'light' | 'moderate' | 'active' | 'very_active';
export type ExperienceLevel = 'new' | 'returning' | 'intermediate' | 'advanced';
export type WeeklyPace = 'easy' | 'steady' | 'fast';

export type Nutrients = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodiumMg?: number;
  potassiumMg?: number;
  cholesterolMg?: number;
  calciumMg?: number;
  ironMg?: number;
  magnesiumMg?: number;
  phosphorusMg?: number;
  zincMg?: number;
  seleniumUg?: number;
  vitaminAUg?: number;
  vitaminCMg?: number;
  vitaminDUg?: number;
  vitaminB12Ug?: number;
  folateUg?: number;
  micronutrients?: Record<string, number | string | null>;
};

export type Food = {
  id: string;
  source: 'usda' | 'openfoodfacts' | 'custom' | 'seed';
  sourceId?: string;
  name: string;
  brand?: string;
  servingUnit?: string;
  servingGrams?: number;
  nutrientsPer100g: Nutrients;
};

export type MealEntry = {
  id: string;
  date: string;
  mealType: MealType;
  food: Food;
  grams: number;
  nutrients: Nutrients;
  createdAt: string;
};

export type SavedMeal = {
  id: string;
  name: string;
  items: Array<{ food: Food; grams: number }>;
};

export type UserProfile = {
  id: string;
  name: string;
  age: number;
  gender: 'male' | 'female';
  heightCm: number;
  currentWeightKg: number;
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
  dailyStepsTarget: number;
  goal: Goal;
  calorieTarget: number;
  proteinTargetG: number;
  fatTargetG: number;
  carbTargetG: number;
  /** Everything below is optional — onboarding asks for it but never insists. */
  targetWeightKg?: number;
  experienceLevel?: ExperienceLevel;
  weeklyPace?: WeeklyPace;
  cardioDaysPerWeek?: number;
  /** Set once the user has been through onboarding, whether they filled it in or skipped. */
  onboardedAt?: string | null;
};

export type StrengthSet = {
  weightKg: number;
  reps: number;
  rir?: number;
};

export type StrengthExercise = {
  name: string;
  sets: StrengthSet[];
};

export type StrengthSession = {
  id: string;
  date: string;
  templateName: string;
  exercises: StrengthExercise[];
  notes?: string;
};

export type ProgramDay = {
  id: string;
  weekday: number;
  name: string;
  exercises: string[];
  isRestDay?: boolean;
};

export type TrainingProgram = {
  id: string;
  name: string;
  days: ProgramDay[];
};

export type CardioEntry = {
  id: string;
  date: string;
  type: string;
  durationMin: number;
  distanceKm?: number;
  calories?: number;
};

export type StepEntry = {
  id: string;
  date: string;
  steps: number;
};

export type BodyMetric = {
  id: string;
  date: string;
  weightKg?: number;
  waistCm?: number;
  bodyFatPercent?: number;
};

export type ProgressPhoto = {
  id: string;
  date: string;
  label: string;
  url: string;
};
