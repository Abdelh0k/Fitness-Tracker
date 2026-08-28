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
