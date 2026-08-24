import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Dumbbell, Flame, Footprints, Target, User } from 'lucide-react';
import { calculateTargets } from './lib/nutrition';
import type { ActivityLevel, ExperienceLevel, Goal, UserProfile, WeeklyPace } from './types';

/**
 * Nothing here is required. Every step can be skipped, and anything left blank
 * falls back to what the profile already holds.
 */
type Draft = {
  name: string;
  gender: 'male' | 'female';
  age: string;
  heightCm: string;
  currentWeightKg: string;
  targetWeightKg: string;
  goal: Goal;
  weeklyPace: WeeklyPace;
  experienceLevel?: ExperienceLevel;
  trainingDaysPerWeek: string;
  cardioDaysPerWeek: string;
  dailyStepsTarget: string;
  activityLevel: ActivityLevel;
};

const goalOptions: Array<{ value: Goal; title: string; note: string }> = [
  { value: 'fat_loss', title: 'Lose fat', note: 'Eat a bit less than you burn' },
  { value: 'recomp', title: 'Lose fat and build muscle', note: 'Slower, but you keep your strength' },
  { value: 'muscle_gain', title: 'Build muscle', note: 'Eat a bit more and train hard' },
  { value: 'maintain', title: 'Stay where I am', note: 'Hold steady and stay consistent' }
];

const paceOptions: Array<{ value: WeeklyPace; title: string; note: string }> = [
  { value: 'easy', title: 'Take it easy', note: 'Slower, easier to stick to' },
  { value: 'steady', title: 'Steady', note: 'A sensible middle ground' },
  { value: 'fast', title: 'Push it', note: 'Faster, but it will feel like work' }
];

const experienceOptions: Array<{ value: ExperienceLevel; title: string; note: string }> = [
  { value: 'new', title: 'Brand new', note: 'Never really trained before' },
  { value: 'returning', title: 'Getting back into it', note: 'Trained before, had a break' },
  { value: 'intermediate', title: 'A year or two in', note: 'You know your way round a gym' },
  { value: 'advanced', title: 'Been at it for years', note: 'Training is part of your life' }
];

const activityOptions: Array<{ value: ActivityLevel; title: string; note: string }> = [
  { value: 'light', title: 'Mostly sitting', note: 'Desk job, not much walking' },
  { value: 'moderate', title: 'On my feet a bit', note: 'Some walking through the day' },
  { value: 'active', title: 'Moving a lot', note: 'Rarely sat still for long' },
  { value: 'very_active', title: 'On my feet all day', note: 'Physical job or very active' }
];

const stepPresets = [5000, 7500, 10000, 12500];

export default function Onboarding({ profile, onComplete }: { profile: UserProfile; onComplete: (profile: UserProfile) => void }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    name: profile.name === 'You' ? '' : profile.name,
    gender: profile.gender,
    age: '',
    heightCm: '',
    currentWeightKg: '',
    targetWeightKg: '',
    goal: profile.goal,
    weeklyPace: profile.weeklyPace || 'steady',
    experienceLevel: profile.experienceLevel,
    trainingDaysPerWeek: '',
    cardioDaysPerWeek: '',
    dailyStepsTarget: '',
    activityLevel: profile.activityLevel
  });

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const merged = useMemo(() => mergeDraft(profile, draft), [profile, draft]);
  const targets = useMemo(() => calculateTargets(merged), [merged]);

  const steps: Array<{ key: string; icon: ReactNode; eyebrow: string; title: string; blurb: string; body: ReactNode }> = [
    {
      key: 'about',
      icon: <User size={20} />,
      eyebrow: 'First up',
      title: 'A bit about you',
      blurb: 'This is what we use to work out how much you should be eating. Rough numbers are fine.',
      body: (
        <div className="ob-fields">
          <label>
            What should we call you?
            <input value={draft.name} onChange={(event) => set('name', event.target.value)} placeholder="Your name" autoFocus />
          </label>
          <div className="ob-split">
            <Choice
              options={[
                { value: 'male' as const, title: 'Male', note: '' },
                { value: 'female' as const, title: 'Female', note: '' }
              ]}
              current={draft.gender}
              onSelect={(value) => set('gender', value)}
              compact
            />
          </div>
          <div className="ob-row three">
            <label>
              Age
              <input value={draft.age} onChange={(event) => set('age', event.target.value)} inputMode="numeric" placeholder={String(profile.age)} />
            </label>
            <label>
              Height (cm)
              <input value={draft.heightCm} onChange={(event) => set('heightCm', event.target.value)} inputMode="decimal" placeholder={String(profile.heightCm)} />
            </label>
            <label>
              Weight (kg)
              <input value={draft.currentWeightKg} onChange={(event) => set('currentWeightKg', event.target.value)} inputMode="decimal" placeholder={String(profile.currentWeightKg)} />
            </label>
          </div>
        </div>
      )
    },
    {
      key: 'goal',
      icon: <Target size={20} />,
      eyebrow: 'Next',
      title: 'What are you after?',
      blurb: 'Pick whichever is closest. You can change it any time.',
      body: (
        <div className="ob-fields">
          <Choice options={goalOptions} current={draft.goal} onSelect={(value) => set('goal', value)} />
          {draft.goal !== 'maintain' ? (
            <>
              <label className="ob-inline-label">
                Got a weight in mind? <span>optional</span>
                <input
                  value={draft.targetWeightKg}
                  onChange={(event) => set('targetWeightKg', event.target.value)}
                  inputMode="decimal"
                  placeholder="kg"
                />
              </label>
              <div className="ob-subsection">
                <p className="eyebrow">How fast?</p>
                <Choice options={paceOptions} current={draft.weeklyPace} onSelect={(value) => set('weeklyPace', value)} />
              </div>
            </>
          ) : null}
        </div>
      )
    },
    {
      key: 'training',
      icon: <Dumbbell size={20} />,
      eyebrow: 'Training',
      title: 'How much lifting do you do?',
      blurb: 'This shapes your weekly plan and what counts as a good week.',
      body: (
        <div className="ob-fields">
          <Choice options={experienceOptions} current={draft.experienceLevel} onSelect={(value) => set('experienceLevel', value)} />
          <div className="ob-subsection">
            <p className="eyebrow">Days a week you want to lift</p>
            <Chips
              values={[0, 1, 2, 3, 4, 5, 6, 7]}
              current={draft.trainingDaysPerWeek}
              onSelect={(value) => set('trainingDaysPerWeek', value)}
              format={(value) => String(value)}
            />
          </div>
        </div>
      )
    },
    {
      key: 'cardio',
      icon: <Flame size={20} />,
      eyebrow: 'Cardio',
      title: 'And the rest of your movement?',
      blurb: 'Walks, runs, rides — plus roughly how many steps you want to hit a day.',
      body: (
        <div className="ob-fields">
          <div className="ob-subsection">
            <p className="eyebrow">Cardio sessions a week</p>
            <Chips
              values={[0, 1, 2, 3, 4, 5, 6, 7]}
              current={draft.cardioDaysPerWeek}
              onSelect={(value) => set('cardioDaysPerWeek', value)}
              format={(value) => String(value)}
            />
          </div>
          <div className="ob-subsection">
            <p className="eyebrow">Daily steps</p>
            <Chips
              values={stepPresets}
              current={draft.dailyStepsTarget}
              onSelect={(value) => set('dailyStepsTarget', value)}
              format={(value) => `${value / 1000}k`}
            />
            <label className="ob-inline-label">
              Or type your own <span>optional</span>
              <input
                value={draft.dailyStepsTarget}
                onChange={(event) => set('dailyStepsTarget', event.target.value)}
                inputMode="numeric"
                placeholder={String(profile.dailyStepsTarget)}
              />
            </label>
          </div>
        </div>
      )
    },
    {
      key: 'activity',
      icon: <Footprints size={20} />,
      eyebrow: 'Almost there',
      title: 'What are your days like?',
      blurb: 'Outside of training — this is about your job and everyday life.',
      body: <Choice options={activityOptions} current={draft.activityLevel} onSelect={(value) => set('activityLevel', value)} />
    }
  ];

  const isSummary = step === steps.length;
  const current = steps[step];
  const progress = ((step + 1) / (steps.length + 1)) * 100;

  function finish(useDraft = true) {
    const base = useDraft ? mergeDraft(profile, draft) : profile;
    const next = useDraft ? calculateTargets(base) : null;
    onComplete({
      ...base,
      ...(next
        ? {
            calorieTarget: next.calorieTarget,
            proteinTargetG: next.proteinTargetG,
            fatTargetG: next.fatTargetG,
            carbTargetG: next.carbTargetG
          }
        : {}),
      onboardedAt: new Date().toISOString()
    });
  }

  return (
    <main className="onboarding">
      <div className="ob-card">
        <div className="ob-top">
          {step > 0 ? (
            <button className="icon-only" onClick={() => setStep(step - 1)} aria-label="Go back">
              <ArrowLeft size={17} />
            </button>
          ) : (
            <span className="ob-top-spacer" />
          )}
          <div className="ob-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${progress}%` }} />
          </div>
          {isSummary ? <span className="ob-top-spacer" /> : <button className="text-button" onClick={() => finish(false)}>Skip all</button>}
        </div>

        {isSummary ? (
          <div className="ob-body">
            <span className="ob-icon"><Check size={20} /></span>
            <p className="eyebrow">All done</p>
            <h1>Here’s your starting point</h1>
            <p className="ob-blurb">
              We worked these out from what you told us. Nothing is set in stone — tweak them any time from your profile.
            </p>
            <div className="ob-summary">
              <div className="ob-summary-main">
                <strong>{targets.calorieTarget.toLocaleString()}</strong>
                <span>calories a day</span>
              </div>
              <div className="ob-summary-macros">
                <div><b>{targets.proteinTargetG}g</b><span>protein</span></div>
                <div><b>{targets.carbTargetG}g</b><span>carbs</span></div>
                <div><b>{targets.fatTargetG}g</b><span>fat</span></div>
              </div>
            </div>
            <p className="ob-note">
              You burn roughly {targets.tdee.toLocaleString()} on a normal day. {summaryLine(merged)}
            </p>
            <button className="primary" onClick={() => finish(true)}>Let’s go</button>
          </div>
        ) : (
          <div className="ob-body" key={current.key}>
            <span className="ob-icon">{current.icon}</span>
            <p className="eyebrow">{current.eyebrow}</p>
            <h1>{current.title}</h1>
            <p className="ob-blurb">{current.blurb}</p>
            {current.body}
            <div className="ob-actions">
              <button className="primary" onClick={() => setStep(step + 1)}>Continue</button>
              <button className="text-button" onClick={() => setStep(step + 1)}>Skip this bit</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Choice<T extends string>({
  options,
  current,
  onSelect,
  compact = false
}: {
  options: Array<{ value: T; title: string; note: string }>;
  current?: T;
  onSelect: (value: T) => void;
  compact?: boolean;
}) {
  return (
    <div className={`ob-choices ${compact ? 'compact' : ''}`}>
      {options.map((option) => (
        <button
          key={option.value}
          className={current === option.value ? 'active' : ''}
          onClick={() => onSelect(option.value)}
          aria-pressed={current === option.value}
        >
          <span>
            <strong>{option.title}</strong>
            {option.note ? <small>{option.note}</small> : null}
          </span>
          <i aria-hidden="true">{current === option.value ? <Check size={14} /> : null}</i>
        </button>
      ))}
    </div>
  );
}

function Chips({
  values,
  current,
  onSelect,
  format
}: {
  values: number[];
  current: string;
  onSelect: (value: string) => void;
  format: (value: number) => string;
}) {
  return (
    <div className="ob-chips">
      {values.map((value) => (
        <button key={value} className={current === String(value) ? 'active' : ''} onClick={() => onSelect(String(value))}>
          {format(value)}
        </button>
      ))}
    </div>
  );
}

/** Anything blank or nonsensical keeps whatever the profile already had. */
function mergeDraft(profile: UserProfile, draft: Draft): UserProfile {
  const targetWeight = Number(draft.targetWeightKg);
  return {
    ...profile,
    name: draft.name.trim() || profile.name,
    gender: draft.gender,
    age: positive(draft.age, profile.age, 13, 100),
    heightCm: positive(draft.heightCm, profile.heightCm, 100, 250),
    currentWeightKg: positive(draft.currentWeightKg, profile.currentWeightKg, 30, 300),
    targetWeightKg: targetWeight >= 30 && targetWeight <= 300 ? targetWeight : profile.targetWeightKg,
    goal: draft.goal,
    weeklyPace: draft.goal === 'maintain' ? 'steady' : draft.weeklyPace,
    experienceLevel: draft.experienceLevel,
    trainingDaysPerWeek: wholeNumber(draft.trainingDaysPerWeek, profile.trainingDaysPerWeek, 0, 14),
    cardioDaysPerWeek: wholeNumber(draft.cardioDaysPerWeek, profile.cardioDaysPerWeek ?? 2, 0, 14),
    dailyStepsTarget: wholeNumber(draft.dailyStepsTarget, profile.dailyStepsTarget, 0, 100000),
    activityLevel: draft.activityLevel
  };
}

function positive(raw: string, fallback: number, min: number, max: number) {
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value) || value < min || value > max) return fallback;
  return value;
}

function wholeNumber(raw: string, fallback: number, min: number, max: number) {
  const value = Math.round(Number(raw));
  if (!raw.trim() || !Number.isFinite(value) || value < min || value > max) return fallback;
  return value;
}

function summaryLine(profile: UserProfile) {
  if (profile.goal === 'maintain') return 'These keep you right about where you are.';
  const direction = profile.goal === 'muscle_gain' ? 'gain' : 'lose';
  if (!profile.targetWeightKg) return `That leaves you set up to ${direction} weight steadily.`;
  const gap = Math.abs(profile.targetWeightKg - profile.currentWeightKg);
  if (gap < 0.5) return 'You’re basically at your target already.';
  return `That’s ${gap.toFixed(1)} kg to ${direction} to reach ${profile.targetWeightKg} kg.`;
}
