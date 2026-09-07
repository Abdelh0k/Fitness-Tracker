/**
 * Ported verbatim from the Ateform app's src/lib/cardioCalories.ts so the MCP server can
 * auto-estimate calories the same way the app does when a caller doesn't supply them.
 * Keep both copies in sync if the formulas ever change.
 *
 * Calorie estimates from published exercise-physiology sources, not guesses:
 *  - ACSM metabolic equations (walking, running, leg cycle ergometry, stepping) —
 *    ACSM's Guidelines for Exercise Testing and Prescription.
 *  - Fixed MET values for machines ACSM has no speed/grade formula for —
 *    Ainsworth et al., 2011 Compendium of Physical Activities.
 * All routes end in the same conversion: 1 MET = 3.5 ml O2/kg/min, and
 * ~5 kcal are burned per liter of O2 consumed, giving kcal/min = VO2 * weightKg / 200.
 */

export type CardioMachine = 'treadmill' | 'bike' | 'stair_climber' | 'elliptical' | 'rowing' | 'ski_erg' | 'assault_bike' | 'other';

function kcalFromVO2(vo2MlPerKgPerMin: number, weightKg: number, minutes: number) {
  return (vo2MlPerKgPerMin * weightKg * minutes) / 200;
}

function kcalFromMets(mets: number, weightKg: number, minutes: number) {
  return kcalFromVO2(mets * 3.5, weightKg, minutes);
}

/** ACSM walking equation, valid roughly 1.9-3.7 mph (50-100 m/min); running equation above that. */
function treadmillVO2(speedKmh: number, inclinePercent: number) {
  const speedMPerMin = (speedKmh * 1000) / 60;
  const grade = inclinePercent / 100;
  const isRunning = speedKmh >= 8; // ~5 mph, the standard walk/run crossover
  return isRunning
    ? 0.2 * speedMPerMin + 0.9 * speedMPerMin * grade + 3.5
    : 0.1 * speedMPerMin + 1.8 * speedMPerMin * grade + 3.5;
}

/** ACSM leg cycle ergometry equation, valid ~50-200 watts. Also used for assault bikes (same power-based physics). */
function cycleVO2(watts: number) {
  const workRateKgmPerMin = watts * 6.12; // 1 watt = 6.12 kgm/min
  return 1.8 * workRateKgmPerMin + 7;
}

/** ACSM stepping equation (derived from bench-stepping, applied to stair machines). Default step height matches a standard StairMaster (~20.3cm). */
function steppingVO2(stepRate: number, stepHeightM = 0.203) {
  return 0.2 * stepRate + 1.33 * 1.8 * stepHeightM * stepRate + 3.5;
}

export type CyclingEffort = 'low' | 'medium' | 'hard' | 'very_hard' | 'max';
export type RowingEffort = 'low' | 'medium' | 'hard' | 'very_hard';

/** Compendium of Physical Activities, codes 02013-02017: bicycling ergometer METs by power output. Also used for assault bikes (same power-based physics). */
export const cyclingEffortLevels: Record<CyclingEffort, { watts: number; mets: number; label: string }> = {
  low: { watts: 50, mets: 3.0, label: 'Low' },
  medium: { watts: 100, mets: 5.5, label: 'Medium' },
  hard: { watts: 150, mets: 7.0, label: 'Hard' },
  very_hard: { watts: 200, mets: 8.5, label: 'Very hard' },
  max: { watts: 250, mets: 11.0, label: 'Max' },
};

/** Compendium of Physical Activities, codes 02135/02130/02131/02132: rowing ergometer METs by power output. */
export const rowingEffortLevels: Record<RowingEffort, { mets: number; label: string }> = {
  low: { mets: 4.8, label: 'Low' },
  medium: { mets: 7.0, label: 'Medium' },
  hard: { mets: 8.5, label: 'Hard' },
  very_hard: { mets: 12.0, label: 'Very hard' },
};

function rowingMetsFromWatts(watts: number) {
  if (watts < 100) return rowingEffortLevels.low.mets;
  if (watts < 150) return rowingEffortLevels.medium.mets;
  if (watts < 200) return rowingEffortLevels.hard.mets;
  return rowingEffortLevels.very_hard.mets;
}

export function estimateCardioCalories(input: {
  machine: CardioMachine;
  weightKg: number;
  minutes: number;
  speedKmh?: number;
  inclinePercent?: number;
  watts?: number;
  stepRate?: number;
  cyclingEffort?: CyclingEffort;
  rowingEffort?: RowingEffort;
}): number | null {
  const { machine, weightKg, minutes } = input;
  if (!weightKg || !minutes) return null;

  switch (machine) {
    case 'treadmill':
      if (!input.speedKmh) return null;
      return Math.round(kcalFromVO2(treadmillVO2(input.speedKmh, input.inclinePercent || 0), weightKg, minutes));
    case 'bike':
    case 'assault_bike':
      if (input.watts) return Math.round(kcalFromVO2(cycleVO2(input.watts), weightKg, minutes));
      return Math.round(kcalFromMets(cyclingEffortLevels[input.cyclingEffort || 'hard'].mets, weightKg, minutes));
    case 'stair_climber':
      return Math.round(
        input.stepRate
          ? kcalFromVO2(steppingVO2(input.stepRate), weightKg, minutes)
          : kcalFromMets(9.0, weightKg, minutes), // Compendium: stair-treadmill ergometer, general
      );
    case 'elliptical':
      return Math.round(kcalFromMets(5.0, weightKg, minutes)); // Compendium: elliptical trainer, moderate effort
    case 'ski_erg':
      return Math.round(kcalFromMets(7.0, weightKg, minutes)); // Compendium: skiing, cross-country machine, general
    case 'rowing':
      if (input.watts) return Math.round(kcalFromMets(rowingMetsFromWatts(input.watts), weightKg, minutes));
      return Math.round(kcalFromMets(rowingEffortLevels[input.rowingEffort || 'medium'].mets, weightKg, minutes));
    default:
      return null;
  }
}

export const cardioMachineLabels: Record<CardioMachine, string> = {
  treadmill: 'Treadmill',
  bike: 'Stationary bike',
  stair_climber: 'Stair climber',
  elliptical: 'Elliptical',
  rowing: 'Rowing machine',
  ski_erg: 'Ski erg',
  assault_bike: 'Assault bike',
  other: 'Other',
};
