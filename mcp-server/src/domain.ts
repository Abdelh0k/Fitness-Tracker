export type Nutrients = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
};

const round = (value: number, places = 1) => Number(value.toFixed(places));

export function per100g(nutrients: Nutrients, grams: number): Nutrients {
  const factor = 100 / grams;
  return {
    calories: round(nutrients.calories * factor),
    protein: round(nutrients.protein * factor),
    carbs: round(nutrients.carbs * factor),
    fat: round(nutrients.fat * factor),
    fiber: nutrients.fiber == null ? undefined : round(nutrients.fiber * factor),
    sugar: nutrients.sugar == null ? undefined : round(nutrients.sugar * factor),
  };
}

/** Inverse of per100g: scale a per-100g nutrient profile up to an actual portion. */
export function scaleNutrients(per100gNutrients: Nutrients, grams: number): Nutrients {
  const factor = grams / 100;
  return {
    calories: round(per100gNutrients.calories * factor, 0),
    protein: round(per100gNutrients.protein * factor),
    carbs: round(per100gNutrients.carbs * factor),
    fat: round(per100gNutrients.fat * factor),
    fiber: per100gNutrients.fiber == null ? undefined : round(per100gNutrients.fiber * factor),
    sugar: per100gNutrients.sugar == null ? undefined : round(per100gNutrients.sugar * factor),
  };
}

export function sumNutrients(rows: Array<{ nutrients?: Partial<Nutrients> | null }>): Nutrients {
  const total = rows.reduce<Nutrients>((sum, row) => {
    const value = row.nutrients || {};
    sum.calories += Number(value.calories || 0);
    sum.protein += Number(value.protein || 0);
    sum.carbs += Number(value.carbs || 0);
    sum.fat += Number(value.fat || 0);
    sum.fiber = Number(sum.fiber || 0) + Number(value.fiber || 0);
    sum.sugar = Number(sum.sugar || 0) + Number(value.sugar || 0);
    return sum;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 });
  return Object.fromEntries(Object.entries(total).map(([key, value]) => [key, round(value)])) as Nutrients;
}

export function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
