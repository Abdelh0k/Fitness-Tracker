import type { ActivityLevel, Food, Goal, Nutrients, UserProfile, WeeklyPace } from '../types';

export const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const activityMultipliers: Record<ActivityLevel, number> = {
  light: 1.45,
  moderate: 1.55,
  active: 1.65,
  very_active: 1.78
};

const goalAdjustments: Record<Goal, number> = {
  fat_loss: -450,
  recomp: -250,
  maintain: 0,
  muscle_gain: 200
};

/** How hard the user wants to push the deficit or surplus. Defaults to steady. */
const paceFactors: Record<WeeklyPace, number> = {
  easy: 0.6,
  steady: 1,
  fast: 1.5
};

export function roundTo(value: number, step = 5) {
  return Math.round(value / step) * step;
}

export function calculateTargets(
  input: Pick<UserProfile, 'age' | 'gender' | 'heightCm' | 'currentWeightKg' | 'activityLevel' | 'goal'> &
    Partial<Pick<UserProfile, 'weeklyPace'>>
) {
  const sexConstant = input.gender === 'male' ? 5 : -161;
  const bmr = 10 * input.currentWeightKg + 6.25 * input.heightCm - 5 * input.age + sexConstant;
  const tdee = bmr * activityMultipliers[input.activityLevel];
  const adjustment = goalAdjustments[input.goal] * paceFactors[input.weeklyPace || 'steady'];
  const calories = Math.max(1500, roundTo(tdee + adjustment, 10));
  const protein = roundTo(input.currentWeightKg * (input.goal === 'muscle_gain' ? 2.1 : 2.0), 5);
  const fat = roundTo((calories * 0.25) / 9, 5);
  const carbs = Math.max(0, roundTo((calories - protein * 4 - fat * 9) / 4, 5));

  return {
    calorieTarget: calories,
    proteinTargetG: protein,
    fatTargetG: fat,
    carbTargetG: carbs,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee)
  };
}

export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  const ratio = grams / 100;
  const scaled: Nutrients = {
    calories: Math.round((per100g.calories || 0) * ratio),
    protein: round1((per100g.protein || 0) * ratio),
    carbs: round1((per100g.carbs || 0) * ratio),
    fat: round1((per100g.fat || 0) * ratio)
  };
  if (per100g.fiber !== undefined) scaled.fiber = round1(per100g.fiber * ratio);
  if (per100g.sugar !== undefined) scaled.sugar = round1(per100g.sugar * ratio);
  if (per100g.sodiumMg !== undefined) scaled.sodiumMg = Math.round(per100g.sodiumMg * ratio);
  if (per100g.potassiumMg !== undefined) scaled.potassiumMg = Math.round(per100g.potassiumMg * ratio);
  if (per100g.cholesterolMg !== undefined) scaled.cholesterolMg = Math.round(per100g.cholesterolMg * ratio);
  if (per100g.calciumMg !== undefined) scaled.calciumMg = Math.round(per100g.calciumMg * ratio);
  if (per100g.ironMg !== undefined) scaled.ironMg = round1(per100g.ironMg * ratio);
  if (per100g.magnesiumMg !== undefined) scaled.magnesiumMg = Math.round(per100g.magnesiumMg * ratio);
  if (per100g.phosphorusMg !== undefined) scaled.phosphorusMg = Math.round(per100g.phosphorusMg * ratio);
  if (per100g.zincMg !== undefined) scaled.zincMg = round1(per100g.zincMg * ratio);
  if (per100g.seleniumUg !== undefined) scaled.seleniumUg = round1(per100g.seleniumUg * ratio);
  if (per100g.vitaminAUg !== undefined) scaled.vitaminAUg = Math.round(per100g.vitaminAUg * ratio);
  if (per100g.vitaminCMg !== undefined) scaled.vitaminCMg = round1(per100g.vitaminCMg * ratio);
  if (per100g.vitaminDUg !== undefined) scaled.vitaminDUg = round1(per100g.vitaminDUg * ratio);
  if (per100g.vitaminB12Ug !== undefined) scaled.vitaminB12Ug = round1(per100g.vitaminB12Ug * ratio);
  if (per100g.folateUg !== undefined) scaled.folateUg = Math.round(per100g.folateUg * ratio);
  if (per100g.micronutrients) scaled.micronutrients = per100g.micronutrients;
  return scaled;
}

export function sumNutrients(items: Array<{ nutrients: Nutrients }>): Nutrients {
  return items.reduce<Nutrients>(
    (total, item) => ({
      calories: total.calories + item.nutrients.calories,
      protein: round1(total.protein + item.nutrients.protein),
      carbs: round1(total.carbs + item.nutrients.carbs),
      fat: round1(total.fat + item.nutrients.fat),
      fiber: roundOptional(total.fiber, item.nutrients.fiber),
      sugar: roundOptional(total.sugar, item.nutrients.sugar),
      sodiumMg: roundOptional(total.sodiumMg, item.nutrients.sodiumMg),
      potassiumMg: roundOptional(total.potassiumMg, item.nutrients.potassiumMg),
      calciumMg: roundOptional(total.calciumMg, item.nutrients.calciumMg),
      ironMg: roundOptional(total.ironMg, item.nutrients.ironMg),
      magnesiumMg: roundOptional(total.magnesiumMg, item.nutrients.magnesiumMg),
      phosphorusMg: roundOptional(total.phosphorusMg, item.nutrients.phosphorusMg),
      zincMg: roundOptional(total.zincMg, item.nutrients.zincMg),
      seleniumUg: roundOptional(total.seleniumUg, item.nutrients.seleniumUg),
      vitaminAUg: roundOptional(total.vitaminAUg, item.nutrients.vitaminAUg),
      vitaminCMg: roundOptional(total.vitaminCMg, item.nutrients.vitaminCMg),
      vitaminDUg: roundOptional(total.vitaminDUg, item.nutrients.vitaminDUg),
      vitaminB12Ug: roundOptional(total.vitaminB12Ug, item.nutrients.vitaminB12Ug),
      folateUg: roundOptional(total.folateUg, item.nutrients.folateUg)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export function defaultProfile(): UserProfile {
  const targets = calculateTargets({
    age: 21,
    gender: 'male',
    heightCm: 182,
    currentWeightKg: 80,
    activityLevel: 'active',
    goal: 'recomp'
  });

  return {
    id: 'local-user',
    name: 'You',
    age: 21,
    gender: 'male',
    heightCm: 182,
    currentWeightKg: 80,
    activityLevel: 'active',
    trainingDaysPerWeek: 5,
    dailyStepsTarget: 7000,
    goal: 'recomp',
    calorieTarget: targets.calorieTarget,
    proteinTargetG: targets.proteinTargetG,
    fatTargetG: targets.fatTargetG,
    carbTargetG: targets.carbTargetG,
    weeklyPace: 'steady',
    cardioDaysPerWeek: 2,
    onboardedAt: null
  };
}

export const seedFoods: Food[] = [
  {
    id: 'seed-chicken-breast',
    source: 'seed',
    name: 'Chicken breast, cooked',
    servingUnit: '100 g',
    servingGrams: 100,
    nutrientsPer100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6, sodiumMg: 74, potassiumMg: 256, phosphorusMg: 223, magnesiumMg: 29, zincMg: 1, seleniumUg: 27.6, vitaminB12Ug: 0.3 }
  },
  {
    id: 'seed-white-rice',
    source: 'seed',
    name: 'White rice, cooked',
    servingUnit: '100 g',
    servingGrams: 100,
    nutrientsPer100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 }
  },
  {
    id: 'seed-egg',
    source: 'seed',
    name: 'Egg, whole',
    servingUnit: '1 large',
    servingGrams: 50,
    nutrientsPer100g: { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5, cholesterolMg: 372, calciumMg: 56, ironMg: 1.8, phosphorusMg: 198, seleniumUg: 30.7, vitaminAUg: 160, vitaminDUg: 2, vitaminB12Ug: 1.1, folateUg: 47 }
  },
  {
    id: 'seed-greek-yogurt',
    source: 'seed',
    name: 'Greek yogurt, plain nonfat',
    servingUnit: '100 g',
    servingGrams: 100,
    nutrientsPer100g: { calories: 59, protein: 10.3, carbs: 3.6, fat: 0.4, sodiumMg: 36, potassiumMg: 141, calciumMg: 110, phosphorusMg: 135, vitaminB12Ug: 0.5 }
  },
  {
    id: 'seed-moroccan-bread',
    source: 'seed',
    name: 'Moroccan bread, khobz',
    servingUnit: '100 g',
    servingGrams: 100,
    nutrientsPer100g: { calories: 275, protein: 8.5, carbs: 56, fat: 1.2, fiber: 3 }
  },
  {
    id: 'seed-olive-oil',
    source: 'seed',
    name: 'Olive oil',
    servingUnit: '1 tbsp',
    servingGrams: 13.5,
    nutrientsPer100g: { calories: 884, protein: 0, carbs: 0, fat: 100 }
  },
  {
    id: 'seed-jaouda-yaourt-nature',
    source: 'seed',
    name: 'Yaourt nature',
    brand: 'Jaouda',
    servingUnit: '1 pot (100 g)',
    servingGrams: 100,
    nutrientsPer100g: { calories: 62, protein: 3.5, carbs: 4.7, fat: 3.2, calciumMg: 120 }
  },
  {
    id: 'seed-jaouda-yaourt-proteine',
    source: 'seed',
    name: 'Yaourt Protéiné',
    brand: 'Jaouda',
    servingUnit: '1 pot (100 g)',
    servingGrams: 100,
    nutrientsPer100g: { calories: 70, protein: 8, carbs: 5, fat: 1.5, calciumMg: 130 }
  },
  {
    id: 'seed-jaouda-lait-demi-ecreme',
    source: 'seed',
    name: 'Lait demi-écrémé UHT',
    brand: 'Jaouda',
    servingUnit: '100 ml',
    servingGrams: 100,
    nutrientsPer100g: { calories: 46, protein: 3.2, carbs: 4.8, fat: 1.5, calciumMg: 118 }
  },
  {
    id: 'seed-perli-yaourt-nature',
    source: 'seed',
    name: 'Yaourt nature',
    brand: 'Pérli',
    servingUnit: '1 pot (100 g)',
    servingGrams: 100,
    nutrientsPer100g: { calories: 60, protein: 3.4, carbs: 4.5, fat: 3.3, calciumMg: 118 }
  },
  {
    id: 'seed-perli-yaourt-fruits',
    source: 'seed',
    name: 'Yaourt aux fruits',
    brand: 'Pérli',
    servingUnit: '1 pot (100 g)',
    servingGrams: 100,
    nutrientsPer100g: { calories: 95, protein: 3, carbs: 16, fat: 2.2, calciumMg: 100 }
  },
  {
    id: 'seed-raibi-jamila',
    source: 'seed',
    name: 'Raibi Jamila',
    brand: 'Centrale Danone',
    servingUnit: '1 bottle (100 ml)',
    servingGrams: 100,
    nutrientsPer100g: { calories: 78, protein: 2.6, carbs: 13, fat: 1.8, calciumMg: 90 }
  },
  {
    id: 'seed-danone-activia',
    source: 'seed',
    name: 'Activia nature',
    brand: 'Danone',
    servingUnit: '1 pot (100 g)',
    servingGrams: 100,
    nutrientsPer100g: { calories: 65, protein: 3.5, carbs: 6.5, fat: 3, calciumMg: 125 }
  },
  {
    id: 'seed-vache-qui-rit',
    source: 'seed',
    name: 'La Vache qui rit (portion)',
    brand: 'Bel Maroc',
    servingUnit: '1 portion (16.7 g)',
    servingGrams: 16.7,
    nutrientsPer100g: { calories: 280, protein: 8, carbs: 4, fat: 24, calciumMg: 400, sodiumMg: 780 }
  },
  {
    id: 'seed-kiri',
    source: 'seed',
    name: 'Kiri, fromage fondu',
    brand: 'Kiri',
    servingUnit: '1 portion (18 g)',
    servingGrams: 18,
    nutrientsPer100g: { calories: 260, protein: 8.5, carbs: 3, fat: 23, calciumMg: 350 }
  },
  {
    id: 'seed-jben',
    source: 'seed',
    name: 'Jben, Moroccan fresh cheese',
    servingUnit: '100 g',
    servingGrams: 100,
    nutrientsPer100g: { calories: 98, protein: 11, carbs: 3, fat: 4.5, calciumMg: 90 }
  },
  {
    id: 'seed-chergui-cheese',
    source: 'seed',
    name: 'Fromage Chergui',
    servingUnit: '100 g',
    servingGrams: 100,
    nutrientsPer100g: { calories: 264, protein: 14, carbs: 4, fat: 21, calciumMg: 520, sodiumMg: 620 }
  }
];

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function roundOptional(a?: number, b?: number) {
  if (a === undefined && b === undefined) return undefined;
  return round1((a || 0) + (b || 0));
}
