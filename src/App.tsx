import { familiarName, matchesFood, rankFoods } from '../supabase/functions/_shared/food-search';
import { Component, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Activity,
  Apple,
  Beef,
  Bike,
  Camera,
  Carrot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Drumstick,
  Dumbbell,
  Egg,
  Eye,
  EyeOff,
  Fish,
  Flame,
  Footprints,
  Home,
  Loader2,
  LogOut,
  Milk,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
  Utensils,
  Weight,
  Wheat,
  X
} from 'lucide-react';
import { calculateTargets, defaultProfile, mealTypes, roundTo, scaleNutrients, seedFoods, sumNutrients } from './lib/nutrition';
import { cardioMachineLabels, cyclingEffortLevels, estimateCardioCalories, rowingEffortLevels, type CyclingEffort, type RowingEffort } from './lib/cardioCalories';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import Onboarding from './Onboarding';
import { exerciseLibrary } from './lib/exercises';
import { loadLocal, prettyDate, saveLocal, todayKey, uid, type LocalState } from './lib/store';
import type {
  BodyMetric,
  CardioEntry,
  CardioMachine,
  Food,
  MealEntry,
  MealType,
  ProgressPhoto,
  SavedCardioSession,
  SavedMeal,
  StepEntry,
  StrengthExercise,
  StrengthSession,
  ProgramDay,
  TrainingProgram,
  UserProfile
} from './types';

type Tab = 'today' | 'food' | 'training' | 'progress' | 'profile';
type ProgressRange = 'week' | 'month';

const templateSeeds: Record<string, string[]> = {
  Push: [
    'Bench Press', 'Incline Barbell Press', 'Decline Bench Press', 'Overhead Press', 'Arnold Press',
    'Incline Dumbbell Press', 'Dumbbell Shoulder Press', 'Chest Fly', 'Cable Crossover', 'Push-Up',
    'Dips', 'Lateral Raise', 'Front Raise', 'Rear Delt Fly', 'Triceps Pushdown',
    'Overhead Triceps Extension', 'Skull Crushers', 'Close-Grip Bench Press'
  ],
  Pull: [
    'Deadlift', 'Barbell Row', 'Pendlay Row', 'T-Bar Row', 'Seated Cable Row',
    'Lat Pulldown', 'Pull-Up', 'Chin-Up', 'Single-Arm Dumbbell Row', 'Face Pull',
    'Shrugs', 'Barbell Curl', 'EZ Bar Curl', 'Dumbbell Curl', 'Hammer Curl',
    'Preacher Curl', 'Concentration Curl', 'Cable Curl'
  ],
  Legs: [
    'Back Squat', 'Front Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Extension',
    'Leg Curl', 'Walking Lunge', 'Bulgarian Split Squat', 'Hip Thrust', 'Glute Bridge',
    'Standing Calf Raise', 'Seated Calf Raise', 'Hack Squat', 'Goblet Squat', 'Step-Up'
  ],
  Upper: [
    'Bench Press', 'Barbell Row', 'Overhead Press', 'Lat Pulldown', 'Incline Dumbbell Press',
    'Seated Cable Row', 'Lateral Raise', 'EZ Bar Curl', 'Triceps Pushdown', 'Face Pull',
    'Pull-Up', 'Dips'
  ],
  Lower: [
    'Back Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Extension', 'Leg Curl',
    'Bulgarian Split Squat', 'Hip Thrust', 'Walking Lunge', 'Standing Calf Raise',
    'Seated Calf Raise', 'Glute Bridge', 'Front Squat'
  ]
};


const allKnownExercises = Array.from(new Set([...Object.values(templateSeeds).flat(), ...exerciseLibrary])).sort();

const weekDays = [
  { label: 'Mon', full: 'Monday' },
  { label: 'Tue', full: 'Tuesday' },
  { label: 'Wed', full: 'Wednesday' },
  { label: 'Thu', full: 'Thursday' },
  { label: 'Fri', full: 'Friday' },
  { label: 'Sat', full: 'Saturday' },
  { label: 'Sun', full: 'Sunday' }
];

const initialState: LocalState = {
  profile: defaultProfile(),
  meals: [],
  savedMeals: [],
  strength: [],
  programs: [],
  cardio: [],
  savedCardioSessions: [],
  steps: [],
  body: [],
  photos: []
};

class ViewErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel">
          <h2>Something broke on this screen</h2>
          <p className="hint">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [date, setDate] = useState(todayKey());
  const [state, setState] = useState<LocalState>(() => {
    const saved = loadLocal<Partial<LocalState>>('state', initialState);
    return { ...initialState, ...saved, programs: saved.programs || [], savedCardioSessions: saved.savedCardioSessions || [] };
  });
  const [session, setSession] = useState<Session | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [localMode, setLocalMode] = useState(!hasSupabaseConfig);
  const [toast, setToast] = useState('');
  /** Stops onboarding flashing up before the real profile has come back from Supabase. */
  const [profileReady, setProfileReady] = useState(!hasSupabaseConfig);

  const todaysMeals = useMemo(() => state.meals.filter((entry) => entry.date === date), [state.meals, date]);
  const todaysTotals = useMemo(() => sumNutrients(todaysMeals), [todaysMeals]);
  const todaysStrength = state.strength.find((item) => item.date === date);
  const todaysCardio = state.cardio.filter((item) => item.date === date);
  const todaysSteps = state.steps.find((item) => item.date === date)?.steps || 0;
  const latestBody = [...state.body].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const pageTitles: Record<Tab, string> = {
    today: 'Today',
    food: 'Food',
    training: 'Training',
    progress: 'Body & progress',
    profile: 'Your setup'
  };
  const firstName = state.profile.name.trim().split(/\s+/)[0] || 'there';

  useEffect(() => {
    if (!localMode) saveLocal('state', state);
    if (localMode) saveLocal('state', state);
  }, [state, localMode]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session || localMode) return;
    void loadRemote(session.user.id);
  }, [session, localMode]);

  if (window.location.pathname === '/oauth/consent') {
    return <OAuthConsentView session={session} />;
  }

  function commit(next: LocalState) {
    setState(next);
    saveLocal('state', next);
  }

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  }

  function goTo(nextTab: Tab) {
    setTab(nextTab);
  }

  /**
   * Supabase hands back errors rather than throwing, so an unchecked write fails
   * silently: local state updates, the next reload quietly reverts it. Returns true
   * when the write failed so callers can react.
   */
  function failed(what: string, error: { message: string } | null | undefined) {
    if (!error) return false;
    console.error(`[ateform] could not save ${what}:`, error.message);
    flash(`Couldn’t save your ${what}`);
    return true;
  }

  async function loadRemote(userId: string) {
    if (!supabase) return;
    const client = supabase;
    setRemoteLoading(true);
    try {
      const [profileRes, mealsRes, savedRes, strengthRes, programsRes, cardioRes, savedCardioRes, stepsRes, bodyRes, photosRes] = await Promise.all([
        client.from('profiles').select('*').eq('id', userId).maybeSingle(),
        client.from('meal_entries').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('saved_meals').select('*').eq('user_id', userId),
        client.from('strength_sessions').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('training_programs').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
        client.from('cardio_entries').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('saved_cardio_sessions').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
        client.from('step_entries').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('body_metrics').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('progress_photos').select('*').eq('user_id', userId).order('log_date', { ascending: false })
      ]);

      const profile = profileRes.data
        ? profileFromRow(profileRes.data)
        : { ...state.profile, id: userId, name: session?.user.email?.split('@')[0] || 'You' };

      const photos = await Promise.all(
        (photosRes.data || []).map(async (row: any) => {
          const signed = await client.storage.from('progress-photos').createSignedUrl(row.storage_path, 60 * 60 * 24 * 7);
          return {
            id: row.id,
            date: row.log_date,
            label: row.label || 'Progress',
            url: signed.data?.signedUrl || ''
          };
        })
      );

      commit({
        profile,
        meals: (mealsRes.data || []).map(mealFromRow),
        savedMeals: (savedRes.data || []).map((row: any) => ({ id: row.id, name: row.name, items: row.items || [] })),
        strength: (strengthRes.data || []).map((row: any) => ({
          id: row.id,
          date: row.log_date,
          templateName: row.template_name,
          exercises: row.exercises || [],
          notes: row.notes || ''
        })),
        programs: (programsRes.data || []).map((row: any) => ({ id: row.id, name: row.name, days: row.days || [] })),
        cardio: (cardioRes.data || []).map((row: any) => ({
          id: row.id,
          date: row.log_date,
          type: row.type,
          durationMin: row.duration_min,
          distanceKm: row.distance_km || undefined,
          calories: row.calories || undefined,
          machine: row.machine || undefined,
          speedKmh: row.speed_kmh || undefined,
          inclinePercent: row.incline_percent ?? undefined,
          watts: row.watts || undefined,
          stepRate: row.step_rate || undefined
        })),
        savedCardioSessions: (savedCardioRes.data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          machine: row.machine,
          durationMin: row.duration_min || undefined,
          distanceKm: row.distance_km || undefined,
          speedKmh: row.speed_kmh || undefined,
          inclinePercent: row.incline_percent ?? undefined,
          watts: row.watts || undefined,
          stepRate: row.step_rate || undefined
        })),
        steps: (stepsRes.data || []).map((row: any) => ({ id: row.id, date: row.log_date, steps: row.steps })),
        body: (bodyRes.data || []).map((row: any) => ({
          id: row.id,
          date: row.log_date,
          weightKg: row.weight_kg || undefined,
          waistCm: row.waist_cm || undefined,
          bodyFatPercent: row.body_fat_percent || undefined
        })),
        photos
      });
    } finally {
      setRemoteLoading(false);
      setProfileReady(true);
    }
  }

  async function upsertProfile(profile: UserProfile) {
    commit({ ...state, profile });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('profiles').upsert(profileToRow(profile));
      if (failed('profile', error)) return;
    }
    flash('Saved');
  }

  async function addMealEntries(entries: MealEntry[]) {
    if (!entries.length) return;
    commit({ ...state, meals: [...entries, ...state.meals] });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('meal_entries').insert(entries.map((entry) => mealToRow(entry, session.user.id)));
      if (failed('food', error)) return;
    }
    flash('Meal logged');
  }

  async function deleteMeal(id: string) {
    commit({ ...state, meals: state.meals.filter((entry) => entry.id !== id) });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('meal_entries').delete().eq('id', id);
      failed('change', error);
    }
  }

  async function saveMeal(savedMeal: SavedMeal) {
    const savedMeals = [savedMeal, ...state.savedMeals.filter((item) => item.id !== savedMeal.id)];
    commit({ ...state, savedMeals });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('saved_meals').upsert({ id: savedMeal.id, user_id: session.user.id, name: savedMeal.name, items: savedMeal.items });
      if (failed('meal', error)) return;
    }
    flash('Meal saved');
  }

  async function deleteSavedMeal(id: string) {
    commit({ ...state, savedMeals: state.savedMeals.filter((item) => item.id !== id) });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('saved_meals').delete().eq('id', id);
      failed('change', error);
    }
  }

  async function logSavedMeal(savedMeal: SavedMeal, mealType: MealType) {
    const mealSessionId = uid('meal-session');
    const entries = savedMeal.items.map<MealEntry>((item) => ({
      id: uid('meal'),
      date,
      mealType,
      mealSessionId,
      food: item.food,
      grams: item.grams,
      nutrients: scaleNutrients(item.food.nutrientsPer100g, item.grams),
      createdAt: new Date().toISOString()
    }));
    await addMealEntries(entries);
  }

  async function saveStrength(sessionEntry: StrengthSession) {
    const strength = [sessionEntry, ...state.strength.filter((entry) => entry.id !== sessionEntry.id && entry.date !== sessionEntry.date)];
    commit({ ...state, strength });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('strength_sessions').upsert({
        id: sessionEntry.id,
        user_id: session.user.id,
        log_date: sessionEntry.date,
        template_name: sessionEntry.templateName,
        exercises: sessionEntry.exercises,
        notes: sessionEntry.notes || null
      });
      if (failed('workout', error)) return;
    }
    flash('Workout saved');
  }

  async function saveProgram(program: TrainingProgram) {
    const programs = [program, ...state.programs.filter((entry) => entry.id !== program.id)];
    commit({ ...state, programs });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('training_programs').upsert({ id: program.id, user_id: session.user.id, name: program.name, days: program.days });
      if (failed('program', error)) return;
    }
    flash('Program saved');
  }

  async function deleteProgram(id: string) {
    commit({ ...state, programs: state.programs.filter((entry) => entry.id !== id) });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('training_programs').delete().eq('id', id);
      failed('change', error);
    }
  }

  async function saveCardio(entry: CardioEntry) {
    commit({ ...state, cardio: [entry, ...state.cardio] });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('cardio_entries').insert({
        id: entry.id,
        user_id: session.user.id,
        log_date: entry.date,
        type: entry.type,
        duration_min: entry.durationMin,
        distance_km: entry.distanceKm || null,
        calories: entry.calories || null,
        machine: entry.machine || null,
        speed_kmh: entry.speedKmh || null,
        incline_percent: entry.inclinePercent ?? null,
        watts: entry.watts || null,
        step_rate: entry.stepRate || null
      });
      if (failed('cardio', error)) return;
    }
    flash('Cardio added');
  }

  async function saveCardioSession(entry: SavedCardioSession) {
    const savedCardioSessions = [entry, ...state.savedCardioSessions.filter((item) => item.id !== entry.id)];
    commit({ ...state, savedCardioSessions });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('saved_cardio_sessions').upsert({
        id: entry.id,
        user_id: session.user.id,
        name: entry.name,
        machine: entry.machine,
        duration_min: entry.durationMin || null,
        distance_km: entry.distanceKm || null,
        speed_kmh: entry.speedKmh || null,
        incline_percent: entry.inclinePercent ?? null,
        watts: entry.watts || null,
        step_rate: entry.stepRate || null
      });
      if (failed('cardio session', error)) return;
    }
    flash('Session saved');
  }

  async function deleteCardioSession(id: string) {
    commit({ ...state, savedCardioSessions: state.savedCardioSessions.filter((item) => item.id !== id) });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('saved_cardio_sessions').delete().eq('id', id);
      failed('change', error);
    }
  }

  async function saveSteps(steps: number) {
    const entry: StepEntry = state.steps.find((item) => item.date === date) || { id: uid('steps'), date, steps };
    entry.steps = steps;
    commit({ ...state, steps: [entry, ...state.steps.filter((item) => item.date !== date)] });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('step_entries').upsert({ id: entry.id, user_id: session.user.id, log_date: date, steps });
      if (failed('steps', error)) return;
    }
    flash('Steps saved');
  }

  async function saveBody(entry: BodyMetric) {
    commit({ ...state, body: [entry, ...state.body.filter((item) => item.date !== entry.date)] });
    if (supabase && session && !localMode) {
      const { error } = await supabase.from('body_metrics').upsert({
        id: entry.id,
        user_id: session.user.id,
        log_date: entry.date,
        weight_kg: entry.weightKg || null,
        waist_cm: entry.waistCm || null,
        body_fat_percent: entry.bodyFatPercent || null
      });
      if (failed('measurements', error)) return;
    }
    flash('Saved');
  }

  async function savePhoto(file: File, label: string) {
    let url = URL.createObjectURL(file);
    const id = uid('photo');
    if (supabase && session && !localMode) {
      const path = `${session.user.id}/${date}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
      const upload = await supabase.storage.from('progress-photos').upload(path, file, { upsert: true });
      if (failed('photo', upload.error)) return;
      const { error } = await supabase.from('progress_photos').insert({ id, user_id: session.user.id, log_date: date, label, storage_path: path });
      if (failed('photo', error)) return;
      const signed = await supabase.storage.from('progress-photos').createSignedUrl(path, 60 * 60 * 24 * 7);
      url = signed.data?.signedUrl || url;
    }
    commit({ ...state, photos: [{ id, date, label, url }, ...state.photos] });
    flash('Photo added');
  }

  async function finishOnboarding(profile: UserProfile) {
    if (supabase && session && !localMode) {
      // Write first. If this fails, dropping into the app would be a lie — the next
      // reload pulls the un-onboarded row straight back and undoes everything.
      const { error } = await supabase.from('profiles').upsert(profileToRow(profile));
      if (failed('answers', error)) return;
    }
    commit({ ...state, profile });
    setTab('today');
    flash(`Welcome aboard, ${profile.name.trim().split(/\s+/)[0] || 'you'}`);
  }

  const authenticated = localMode || !hasSupabaseConfig || Boolean(session);

  if (!authenticated) {
    return <AuthScreen onLocal={() => { setLocalMode(true); setProfileReady(true); }} />;
  }

  if (!profileReady) {
    return (
      <main className="boot-screen">
        <Loader2 className="spin" size={22} />
        <p>Getting your stuff…</p>
      </main>
    );
  }

  if (!state.profile.onboardedAt) {
    return <Onboarding profile={state.profile} onComplete={finishOnboarding} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="mobile-brand" aria-label="Ateform">
          <div className="brand-mark">A</div>
        </div>
        <div className="topbar-copy">
          <p className="eyebrow">Hey, {firstName}</p>
          <h1>{pageTitles[tab]}</h1>
        </div>
        <div className="topbar-actions">
          {tab !== 'profile' ? <DateNav date={date} setDate={setDate} /> : null}
          <button
            className={`header-settings ${tab === 'profile' ? 'active' : ''}`}
            title={localMode ? 'Profile and settings · just on this device' : `Profile and settings · ${session?.user.email || ''}`}
            aria-label="Open profile and settings"
            aria-pressed={tab === 'profile'}
            onClick={() => goTo('profile')}
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {remoteLoading ? (
        <div className="sync-pill">
          <Loader2 size={14} className="spin" /> Syncing
        </div>
      ) : null}

      <main>
        <ViewErrorBoundary key={tab}>
        {tab === 'today' ? (
          <TodayView
            profile={state.profile}
            date={date}
            meals={todaysMeals}
            totals={todaysTotals}
            strength={todaysStrength}
            cardio={todaysCardio}
            steps={todaysSteps}
            latestBody={latestBody}
            history={{
              meals: state.meals,
              strength: state.strength,
              cardio: state.cardio,
              steps: state.steps,
              body: state.body
            }}
            onGo={goTo}
          />
        ) : null}
        {tab === 'food' ? (
          <FoodView
            date={date}
            onSelectDate={setDate}
            meals={todaysMeals}
            allMeals={state.meals}
            savedMeals={state.savedMeals}
            onAddMeal={addMealEntries}
            onDelete={deleteMeal}
            onSaveMeal={saveMeal}
            onDeleteSavedMeal={deleteSavedMeal}
            onLogSavedMeal={logSavedMeal}
            remoteEnabled={Boolean(supabase && session && !localMode)}
          />
        ) : null}
        {tab === 'training' ? (
          <section className="stack view training-hub-view">
            <TrainingView
              date={date}
              session={todaysStrength}
              programs={state.programs}
              onSaveStrength={saveStrength}
              onSaveProgram={saveProgram}
              onDeleteProgram={deleteProgram}
            />
            <CardioView
              date={date}
              cardio={todaysCardio}
              steps={todaysSteps}
              weightKg={state.profile.currentWeightKg}
              savedSessions={state.savedCardioSessions}
              onSaveCardio={saveCardio}
              onSaveSteps={saveSteps}
              onSaveCardioSession={saveCardioSession}
              onDeleteCardioSession={deleteCardioSession}
            />
          </section>
        ) : null}
        {tab === 'progress' ? (
          <ProgressView
            date={date}
            body={state.body}
            photos={state.photos}
            workouts={state.strength}
            onSaveBody={saveBody}
            onSavePhoto={savePhoto}
          />
        ) : null}
        {tab === 'profile' ? (
          <ProfileView
            profile={state.profile}
            localMode={localMode}
            onSave={upsertProfile}
            onSignOut={async () => {
              if (supabase) await supabase.auth.signOut();
              setLocalMode(!hasSupabaseConfig);
              setProfileReady(!hasSupabaseConfig);
            }}
          />
        ) : null}
        </ViewErrorBoundary>
      </main>

      <nav className="tabbar">
        <div className="nav-brand" aria-label="Ateform"><div className="brand-mark">A</div><span>Ateform</span></div>
        <TabButton active={tab === 'today'} icon={<Home />} label="Today" onClick={() => goTo('today')} />
        <TabButton active={tab === 'food'} icon={<Utensils />} label="Food" onClick={() => goTo('food')} />
        <TabButton active={tab === 'training'} icon={<Dumbbell />} label="Training" onClick={() => goTo('training')} />
        <TabButton active={tab === 'progress'} icon={<Weight />} label="Progress" onClick={() => goTo('progress')} />
      </nav>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function AuthScreen({ onLocal }: { onLocal: () => void }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  function changeMode(nextMode: 'sign-in' | 'sign-up') {
    setMode(nextMode);
    setPassword('');
    setShowPassword(false);
    setFeedback(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFeedback({ type: 'error', text: 'That email doesn’t look right.' });
      return;
    }
    if (password.length < 8) {
      setFeedback({ type: 'error', text: 'Your password needs at least 8 characters.' });
      return;
    }
    if (mode === 'sign-up' && !cleanName) {
      setFeedback({ type: 'error', text: 'What should we call you?' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    const result =
      mode === 'sign-up'
        ? await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: { data: { full_name: cleanName } }
          })
        : await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setBusy(false);

    if (result.error) {
      setFeedback({ type: 'error', text: result.error.message });
      return;
    }

    if (mode === 'sign-up' && !result.data.session) {
      setFeedback({
        type: 'success',
        text: 'You’re in. Check your inbox to confirm your email, then come back and sign in.'
      });
      setPassword('');
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-brand" aria-label="Ateform">
        <div className="brand-mark">A</div>
        <span>Ateform</span>
      </div>
      {hasSupabaseConfig ? (
        <section className="auth-card">
          <div className="auth-heading">
            <p className="eyebrow">Food, lifting, and your weight</p>
            <h1>{mode === 'sign-in' ? 'Welcome back' : 'Let’s get you set up'}</h1>
            <p>
              {mode === 'sign-in'
                ? 'Sign in and pick up where you left off.'
                : 'Track what you eat, what you lift, and how your weight moves.'}
            </p>
          </div>

          <form className="auth-form" onSubmit={submit} noValidate>
            {mode === 'sign-up' ? (
              <label>
                Name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  disabled={busy}
                />
              </label>
            ) : null}

            <label>
              Email
              <input
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="you@example.com"
                disabled={busy}
              />
            </label>

            <label>
              Password
              <span className="password-field">
                <input
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  disabled={busy}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>

            {feedback ? (
              <div className={`auth-feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>
                {feedback.text}
              </div>
            ) : null}

            <button className="primary auth-submit" disabled={busy} type="submit">
              {busy ? <Loader2 className="spin" size={18} /> : null}
              {busy ? 'One sec…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="auth-switch">
            <span>{mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}</span>
            <button type="button" className="text-button" disabled={busy} onClick={() => changeMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
              {mode === 'sign-in' ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </section>
      ) : (
        <div className="panel auth-card">
          <p className="hint">No account set up yet, but you can still try the app right here on this device.</p>
          <button className="primary" onClick={onLocal}>
            Try it on this device
          </button>
        </div>
      )}
    </main>
  );
}

type OAuthAuthorization = {
  client: { name: string; logo_uri?: string };
  scope: string;
  redirect_url?: string;
};

/** Supabase's OAuth 2.1 server sends the browser here mid-flow (an AI client asking to connect); this page is the only thing standing between "click Connect" and a granted token. */
function OAuthConsentView({ session }: { session: Session | null }) {
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id') || '';
  const [details, setDetails] = useState<OAuthAuthorization | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);

  useEffect(() => {
    if (!supabase || !session || !authorizationId) return;
    let cancelled = false;
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: fetchError }) => {
      if (cancelled) return;
      if (fetchError) { setError(fetchError.message); return; }
      if (data?.redirect_url) { window.location.assign(data.redirect_url); return; }
      setDetails(data);
    });
    return () => { cancelled = true; };
  }, [session, authorizationId]);

  async function decide(action: 'approve' | 'deny') {
    if (!supabase) return;
    setBusy(action);
    const { error: decisionError } =
      action === 'approve'
        ? await supabase.auth.oauth.approveAuthorization(authorizationId)
        : await supabase.auth.oauth.denyAuthorization(authorizationId);
    if (decisionError) { setError(decisionError.message); setBusy(null); }
  }

  if (!authorizationId) {
    return <main className="auth-screen"><section className="auth-card panel"><p>Missing authorization link. Ask the app you're connecting from to try again.</p></section></main>;
  }

  if (!session) {
    return <AuthScreen onLocal={() => {}} />;
  }

  return (
    <main className="auth-screen">
      <div className="auth-brand" aria-label="Ateform">
        <div className="brand-mark">A</div>
        <span>Ateform</span>
      </div>
      <section className="auth-card panel consent-card">
        {error ? (
          <p className="auth-feedback error">{error}</p>
        ) : !details ? (
          <p className="hint"><Loader2 className="spin" size={16} /> Loading request…</p>
        ) : (
          <>
            <div className="auth-heading">
              <p className="eyebrow">Connect to Ateform</p>
              <h1>{details.client.name}</h1>
              <p>wants to access your Ateform account ({session.user.email}) — food, training, cardio, and profile data.</p>
            </div>
            <p className="hint">Scopes: {details.scope}</p>
            <div className="grid two">
              <button className="secondary" disabled={busy !== null} onClick={() => decide('deny')}>
                {busy === 'deny' ? <Loader2 className="spin" size={16} /> : <X size={16} />} Deny
              </button>
              <button className="primary" disabled={busy !== null} onClick={() => decide('approve')}>
                {busy === 'approve' ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Allow
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

type TodayHistory = {
  meals: MealEntry[];
  strength: StrengthSession[];
  cardio: CardioEntry[];
  steps: StepEntry[];
  body: BodyMetric[];
};

function TodayView({
  profile,
  date,
  meals,
  totals,
  strength,
  cardio,
  steps,
  latestBody,
  history,
  onGo
}: {
  profile: UserProfile;
  date: string;
  meals: MealEntry[];
  totals: ReturnType<typeof sumNutrients>;
  strength?: StrengthSession;
  cardio: CardioEntry[];
  steps: number;
  latestBody?: BodyMetric;
  history: TodayHistory;
  onGo: (tab: Tab) => void;
}) {
  const caloriesLeft = profile.calorieTarget - totals.calories;
  const calorieProgress = Math.min(100, Math.max(0, (totals.calories / profile.calorieTarget) * 100));
  const cardioMinutes = cardio.reduce((sum, item) => sum + item.durationMin, 0);
  const cardioCalories = cardio.reduce((sum, item) => sum + (item.calories || 0), 0);
  const stepProgress = Math.min(100, profile.dailyStepsTarget ? (steps / profile.dailyStepsTarget) * 100 : 0);
  const sets = strength ? countSets(strength.exercises) : 0;

  return (
    <section className="stack view today-view">
      <div className="panel intake-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Today</p>
            <h2>What you ate</h2>
          </div>
          <button className="secondary small" onClick={() => onGo('food')}>
            <Plus size={14} /> Add food
          </button>
        </div>
        <div className="intake-summary">
          <div
            className={`intake-ring ${caloriesLeft < 0 ? 'over' : ''}`}
            style={{ '--calorie-progress': `${calorieProgress}%` } as CSSProperties}
          >
            <div>
              <strong>{Math.abs(caloriesLeft).toLocaleString()}</strong>
              <span>{caloriesLeft < 0 ? 'kcal over' : 'kcal left'}</span>
            </div>
          </div>
          <div className="intake-bars">
            <Bar label="Calories" value={totals.calories} target={profile.calorieTarget} unit="" />
            <Bar label="Protein" value={totals.protein} target={profile.proteinTargetG} unit="g" />
            <Bar label="Carbs" value={totals.carbs} target={profile.carbTargetG} unit="g" />
            <Bar label="Fat" value={totals.fat} target={profile.fatTargetG} unit="g" />
          </div>
        </div>
      </div>

      <div className="panel activity-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Today</p>
            <h2>What you did</h2>
          </div>
          <span className="activity-note">{[strength, cardioMinutes, steps].filter(Boolean).length} of 3 done</span>
        </div>
        <div className="activity-list">
          <button className={`activity-row ${strength ? 'done' : ''}`} onClick={() => onGo('training')}>
            <span className="activity-icon"><Dumbbell size={17} /></span>
            <span className="activity-copy">
              <strong>Strength</strong>
              <small>{strength ? `${strength.templateName} · ${strength.exercises.length} exercises` : 'Nothing yet — tap to start'}</small>
            </span>
            <span className="activity-value"><b>{sets}</b><i>sets</i></span>
          </button>
          <button className={`activity-row ${cardioMinutes ? 'done' : ''}`} onClick={() => onGo('training')}>
            <span className="activity-icon"><Flame size={17} /></span>
            <span className="activity-copy">
              <strong>Cardio</strong>
              <small>
                {cardio.length
                  ? `${cardio.length} session${cardio.length === 1 ? '' : 's'}${cardioCalories ? ` · ${cardioCalories} kcal` : ''}`
                  : 'Nothing yet — tap to add'}
              </small>
            </span>
            <span className="activity-value"><b>{cardioMinutes}</b><i>min</i></span>
          </button>
          <button className={`activity-row ${steps >= profile.dailyStepsTarget && steps > 0 ? 'done' : ''}`} onClick={() => onGo('training')}>
            <span className="activity-icon"><Footprints size={17} /></span>
            <span className="activity-copy">
              <strong>Steps</strong>
              <small>{Math.round(stepProgress)}% of your {profile.dailyStepsTarget.toLocaleString()}</small>
              <span className="activity-meter"><i style={{ width: `${stepProgress}%` }} /></span>
            </span>
            <span className="activity-value"><b>{steps.toLocaleString()}</b><i>steps</i></span>
          </button>
        </div>
      </div>

      <ProgressSummary date={date} profile={profile} history={history} />

      <div className="panel">
        <div className="panel-head">
          <h2>Everything you logged</h2>
          <button className="text-button" onClick={() => onGo('food')}>See all</button>
        </div>
        {meals.length ? (
          <div className="list">
            {meals.slice(0, 5).map((entry) => (
              <div className="row" key={entry.id}>
                <div>
                  <strong>{entry.food.name}</strong>
                  <p>{entry.mealType} · {entry.grams}g</p>
                </div>
                <span className="mono">{entry.nutrients.calories} kcal</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Nothing yet" text="Head to the Food tab and add what you ate." />
        )}
      </div>
      <div className="panel compact-row">
        <div>
          <p className="eyebrow">Last weigh-in</p>
          <h2>{latestBody?.weightKg ? `${latestBody.weightKg} kg` : 'Not weighed yet'}</h2>
        </div>
        <button className="secondary small" onClick={() => onGo('progress')}>Add weight</button>
      </div>
    </section>
  );
}

function FoodView({
  date,
  onSelectDate,
  meals,
  allMeals,
  savedMeals,
  onAddMeal,
  onDelete,
  onSaveMeal,
  onDeleteSavedMeal,
  onLogSavedMeal,
  remoteEnabled
}: {
  date: string;
  onSelectDate: (date: string) => void;
  meals: MealEntry[];
  allMeals: MealEntry[];
  savedMeals: SavedMeal[];
  onAddMeal: (entries: MealEntry[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaveMeal: (meal: SavedMeal) => Promise<void>;
  onDeleteSavedMeal: (id: string) => Promise<void>;
  onLogSavedMeal: (meal: SavedMeal, type: MealType) => Promise<void>;
  remoteEnabled: boolean;
}) {
  const weekDates = useMemo(() => rangeDays(date, 'week'), [date]);
  const dayStatsByDay = useMemo(() => {
    const map = new Map<string, { calories: number; sessionIds: Set<string> }>();
    for (const entry of allMeals) {
      const current = map.get(entry.date) || { calories: 0, sessionIds: new Set<string>() };
      current.calories += entry.nutrients.calories;
      current.sessionIds.add(entry.mealSessionId);
      map.set(entry.date, current);
    }
    return map;
  }, [allMeals]);

  const mealGroups = useMemo(() => {
    const map = new Map<string, MealEntry[]>();
    for (const entry of meals) {
      if (!map.has(entry.mealSessionId)) map.set(entry.mealSessionId, []);
      map.get(entry.mealSessionId)!.push(entry);
    }
    return Array.from(map.values())
      .map((entries) => ({ entries, totals: sumNutrients(entries) }))
      .sort((a, b) => (a.entries[0].createdAt < b.entries[0].createdAt ? 1 : -1));
  }, [meals]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [mealStarted, setMealStarted] = useState(false);
  const [draftItems, setDraftItems] = useState<Array<{ food: Food; grams: number }>>([]);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [editingSavedMealId, setEditingSavedMealId] = useState<string | null>(null);
  const [custom, setCustom] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' });
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [savingGroup, setSavingGroup] = useState<{ sessionId: string; items: Array<{ food: Food; grams: number }> } | null>(null);
  const [groupSaveName, setGroupSaveName] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<{ text: string; onConfirm: () => void } | null>(null);
  const totals = sumNutrients(meals);
  const draftTotals = sumNutrients(draftItems.map((item) => ({ nutrients: scaleNutrients(item.food.nutrientsPer100g, item.grams) })));

  async function search() {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      const localMatches = seedFoods.filter((food) => matchesFood(food, q));
      if (supabase && remoteEnabled) {
        const { data, error } = await supabase.functions.invoke('food-search', { body: { query: q } });
        if (!error && Array.isArray(data?.foods)) {
          setResults(rankFoods([...localMatches, ...(data.foods as Food[]).map((food) => food.source === 'usda' ? { ...food, originalName: food.originalName || food.name, name: familiarName(food.originalName || food.name) } : food)], q));
          return;
        }
      }
      setResults(rankFoods(localMatches, q));
    } finally {
      setBusy(false);
    }
  }

  function addDraftItem(food: Food) {
    setDraftItems([...draftItems, { food, grams: defaultServingGrams(food) }]);
  }

  function updateDraftGrams(index: number, grams: number) {
    setDraftItems(draftItems.map((item, i) => i === index ? { ...item, grams } : item));
  }

  function removeDraftItem(index: number) {
    setDraftItems(draftItems.filter((_, i) => i !== index));
  }

  function cancelMeal() {
    setDraftItems([]);
    setSaveAsTemplate(false);
    setTemplateName('');
    setEditingSavedMealId(null);
    setQuery('');
    setResults([]);
    setMealStarted(false);
  }

  function toggleGroupExpanded(sessionId: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId); else next.add(sessionId);
      return next;
    });
  }

  function saveLoggedMealAsTemplate() {
    if (!savingGroup || !groupSaveName.trim()) return;
    void onSaveMeal({ id: uid('saved'), name: groupSaveName.trim(), items: savingGroup.items });
    setSavingGroup(null);
    setGroupSaveName('');
  }

  function requestDeleteGroup(mealType: string, entryIds: string[]) {
    setConfirmTarget({
      text: `Remove this ${mealType} (${entryIds.length} item${entryIds.length === 1 ? '' : 's'})? This can't be undone.`,
      onConfirm: () => entryIds.forEach((id) => void onDelete(id))
    });
  }

  function requestDeleteSavedMeal(meal: SavedMeal) {
    setConfirmTarget({
      text: `Delete "${meal.name}"? This can't be undone.`,
      onConfirm: () => void onDeleteSavedMeal(meal.id)
    });
  }

  function startEditSavedMeal(meal: SavedMeal) {
    setDraftItems(meal.items.map((item) => ({ food: item.food, grams: item.grams })));
    setTemplateName(meal.name);
    setEditingSavedMealId(meal.id);
    setMealStarted(true);
  }

  function saveEditedMeal() {
    if (!editingSavedMealId || !templateName.trim() || !draftItems.length) return;
    void onSaveMeal({ id: editingSavedMealId, name: templateName.trim(), items: draftItems.map((item) => ({ food: item.food, grams: item.grams })) });
    cancelMeal();
  }

  function addCustomFood() {
    if (!custom.name) return;
    const food: Food = {
      id: uid('food'),
      source: 'custom',
      name: custom.name,
      servingUnit: '100 g',
      servingGrams: 100,
      nutrientsPer100g: {
        calories: Number(custom.calories) || 0,
        protein: Number(custom.protein) || 0,
        carbs: Number(custom.carbs) || 0,
        fat: Number(custom.fat) || 0
      }
    };
    addDraftItem(food);
    setCustom({ name: '', calories: '', protein: '', carbs: '', fat: '' });
    setCustomModalOpen(false);
  }

  async function logMeal() {
    if (!draftItems.length) return;
    const mealSessionId = uid('meal-session');
    const entries = draftItems.map<MealEntry>((item) => ({
      id: uid('meal'),
      date,
      mealType,
      mealSessionId,
      food: item.food,
      grams: item.grams,
      nutrients: scaleNutrients(item.food.nutrientsPer100g, item.grams),
      createdAt: new Date().toISOString()
    }));
    await onAddMeal(entries);
    if (saveAsTemplate && templateName.trim()) {
      void onSaveMeal({ id: uid('saved'), name: templateName.trim(), items: draftItems.map((item) => ({ food: item.food, grams: item.grams })) });
    }
    cancelMeal();
  }

  return (
    <section className="stack view food-view">
      <div className="panel program-overview">
        <div className="panel-head">
          <p className="eyebrow">Your week</p>
        </div>
        <div className="program-days">
          {weekDates.map((day, index) => {
            const stats = dayStatsByDay.get(day);
            return (
              <button type="button" key={day} className={`program-day ${day === todayKey() ? 'today' : ''} ${day === date ? 'viewing' : ''}`} onClick={() => onSelectDate(day)}>
                <span>{weekDays[index].label}</span>
                <strong>{new Date(`${day}T00:00:00`).getDate()}</strong>
                <small>{stats ? `${stats.sessionIds.size} meal${stats.sessionIds.size === 1 ? '' : 's'} · ${Math.round(stats.calories)} kcal` : 'Nothing logged'}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel food-workspace">
        <div className="panel-head">
          <div><p className="eyebrow">Food</p><h2>{editingSavedMealId ? 'Editing saved meal' : 'Today'}</h2></div>
          {mealStarted && !editingSavedMealId ? <select className="meal-type-select" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>{mealTypes.map((type) => <option key={type}>{type}</option>)}</select> : null}
        </div>

        {!mealStarted ? (
          <button className="primary" onClick={() => setMealStarted(true)}><Plus size={16} /> Start a new meal</button>
        ) : (
          <div className="meal-draft">
            <div className="search-line">
              <Search size={18} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Search chicken, rice, yogurt..." autoFocus />
              <button className="secondary small" onClick={search}>{busy ? <Loader2 className="spin" size={15} /> : 'Search'}</button>
            </div>
            <div className="search-panel-foot">
              <p className="hint">{remoteEnabled ? 'Common foods first - USDA and Open Food Facts' : 'Offline list for now — add your Supabase keys for the full food database.'}</p>
              <button className="text-button" onClick={() => setCustomModalOpen(true)}>Can't find it? Add it yourself</button>
            </div>

            {query.trim() ? (
              <div className="food-list">
                {results.map((food) => {
                  const { Icon, tint } = foodCategory(food.name);
                  const servingSize = defaultServingGrams(food);
                  const portion = isPieceFood(food) ? `1 ${unitLabel(food)}` : `${servingSize}g`;
                  return (
                    <button className="food-result" key={food.id} onClick={() => addDraftItem(food)}>
                      <span className="food-avatar" style={{ background: tint }}><Icon size={18} aria-hidden="true" /></span>
                      <span className="food-result-copy">
                        <strong title={food.originalName}>{food.name}</strong>
                        <span>{food.brand || food.source} · {portion}</span>
                      </span>
                      <MacroMini nutrients={scaleNutrients(food.nutrientsPer100g, servingSize)} />
                      <span className="food-add" aria-hidden="true"><Plus size={16} /></span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="section-title inner"><p className="eyebrow">Adding to this meal</p></div>
            {draftItems.length ? (
              <div className="program-exercise-list meal-draft-list">
                {draftItems.map((item, index) => {
                  const piece = isPieceFood(item.food);
                  const servingSize = defaultServingGrams(item.food);
                  const quantity = piece ? Math.round((item.grams / servingSize) * 10) / 10 : item.grams;
                  const portion = piece ? `${quantity} ${unitLabel(item.food)}` : `${item.grams}g`;
                  return (
                    <div key={`${item.food.id}-${index}`}>
                      <input
                        inputMode="decimal"
                        value={quantity}
                        onChange={(e) => {
                          const next = Number(e.target.value) || 0;
                          updateDraftGrams(index, piece ? Math.round(next * servingSize * 10) / 10 : next);
                        }}
                      />
                      <strong>{item.food.name}<small>{portion} · {scaleNutrients(item.food.nutrientsPer100g, item.grams).calories} kcal</small></strong>
                      <button className="icon-only" onClick={() => removeDraftItem(index)} aria-label={`Remove ${item.food.name}`}><X size={15} /></button>
                    </div>
                  );
                })}
              </div>
            ) : <p className="hint">Search above and tap a result to add it here.</p>}
            {draftItems.length ? (
              <>
                <MacroMini nutrients={draftTotals} />
                {editingSavedMealId ? (
                  <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Meal name" />
                ) : (
                  <>
                    <label className="rest-day-toggle">
                      <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} />
                      Save as a reusable meal
                    </label>
                    {saveAsTemplate ? <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. My usual breakfast" autoFocus /> : null}
                  </>
                )}
              </>
            ) : null}
            <div className="grid two">
              <button className="secondary" onClick={cancelMeal}>Cancel</button>
              {editingSavedMealId ? (
                <button className="primary" onClick={saveEditedMeal} disabled={!draftItems.length || !templateName.trim()}><Save size={16} /> Save changes</button>
              ) : (
                <button className="primary" onClick={logMeal} disabled={!draftItems.length}><Plus size={16} /> Log this meal</button>
              )}
            </div>
          </div>
        )}

        <div className="section-title inner">
          <div><p className="eyebrow">What you ate</p></div>
          <span>{mealGroups.length} meal{mealGroups.length === 1 ? '' : 's'} · {totals.calories} kcal</span>
        </div>
        {mealGroups.length ? (
          <div className="meal-groups">
            {mealGroups.map((group) => {
              const sessionId = group.entries[0].mealSessionId;
              const isOpen = expandedGroups.has(sessionId);
              return (
                <div className={`meal-group ${isOpen ? 'open' : ''}`} key={sessionId}>
                  <button className="meal-group-head" onClick={() => toggleGroupExpanded(sessionId)}>
                    <strong>{group.entries[0].mealType}</strong>
                    <div>
                      {group.entries.some((entry) => entry.source?.startsWith('ai_')) ? <span className="ai-estimate">AI estimate</span> : null}
                      <span>{group.entries.length} item{group.entries.length === 1 ? '' : 's'} · {group.totals.calories} kcal</span>
                      <ChevronDown className="meal-group-chevron" size={15} aria-hidden="true" />
                    </div>
                  </button>
                  {isOpen ? (
                    <>
                      <div className="list">
                        {group.entries.map((entry) => (
                          <div className="row" key={entry.id}>
                            <div>
                              <strong>{entry.food.name}</strong>
                              <p>{entry.grams}g · {entry.nutrients.protein}p/{entry.nutrients.carbs}c/{entry.nutrients.fat}f</p>
                            </div>
                            <button className="icon-only danger" onClick={() => onDelete(entry.id)}><Trash2 size={16} /></button>
                          </div>
                        ))}
                      </div>
                      <div className="meal-group-actions">
                        <button
                          className="text-button"
                          onClick={() => setSavingGroup({ sessionId, items: group.entries.map((entry) => ({ food: entry.food, grams: entry.grams })) })}
                        >
                          Save as a reusable meal
                        </button>
                        <button
                          className="text-button danger"
                          onClick={() => requestDeleteGroup(group.entries[0].mealType, group.entries.map((entry) => entry.id))}
                        >
                          Delete meal
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : <Empty title="Nothing yet" text="Search above and add whatever you've had so far." />}
      </div>

      {customModalOpen ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Add a custom food">
          <div className="panel modal-card">
            <div className="panel-head"><h2>Can't find it? Add it yourself</h2><button className="icon-only" onClick={() => setCustomModalOpen(false)} aria-label="Close"><X size={17} /></button></div>
            <div className="grid two">
              <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="What is it?" autoFocus />
              <input value={custom.calories} onChange={(e) => setCustom({ ...custom, calories: e.target.value })} inputMode="decimal" placeholder="kcal / 100g" />
              <input value={custom.protein} onChange={(e) => setCustom({ ...custom, protein: e.target.value })} inputMode="decimal" placeholder="protein" />
              <input value={custom.carbs} onChange={(e) => setCustom({ ...custom, carbs: e.target.value })} inputMode="decimal" placeholder="carbs" />
              <input value={custom.fat} onChange={(e) => setCustom({ ...custom, fat: e.target.value })} inputMode="decimal" placeholder="fat" />
            </div>
            <button className="primary" onClick={addCustomFood} disabled={!custom.name.trim()}>Add it</button>
          </div>
        </div>
      ) : null}

      {savingGroup ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Save this meal">
          <div className="panel modal-card">
            <div className="panel-head"><div><p className="eyebrow">Save it</p><h2>Give this meal a name</h2></div><button className="icon-only" onClick={() => { setSavingGroup(null); setGroupSaveName(''); }} aria-label="Close"><X size={17} /></button></div>
            <p className="hint">We'll keep all {savingGroup.items.length} item{savingGroup.items.length === 1 ? '' : 's'} and their portions.</p>
            <label className="modal-field">Meal name<input value={groupSaveName} onChange={(e) => setGroupSaveName(e.target.value)} autoFocus placeholder="e.g. My usual breakfast" /></label>
            <button className="primary" onClick={saveLoggedMealAsTemplate} disabled={!groupSaveName.trim()}>Save it</button>
          </div>
        </div>
      ) : null}

      {confirmTarget ? (
        <div className="sheet" role="alertdialog" aria-modal="true" aria-label="Confirm">
          <div className="panel modal-card confirm-card">
            <h2>Are you sure?</h2>
            <p className="hint">{confirmTarget.text}</p>
            <div className="confirm-actions">
              <button className="secondary" onClick={() => setConfirmTarget(null)}>Cancel</button>
              <button className="danger-button" onClick={() => { confirmTarget.onConfirm(); setConfirmTarget(null); }}><Trash2 size={15} /> Remove</button>
            </div>
          </div>
        </div>
      ) : null}

      {meals.length ? <NutrientGrid nutrients={totals} /> : null}

      <div className="panel">
        <h2>Your saved meals</h2>
        {savedMeals.length ? savedMeals.map((meal) => (
          <div className="row" key={meal.id}>
            <div>
              <strong>{meal.name}</strong>
              <p>{meal.items.length} items</p>
            </div>
            <div className="saved-meal-actions">
              <button className="icon-only" onClick={() => startEditSavedMeal(meal)} aria-label={`Edit ${meal.name}`}><Pencil size={15} /></button>
              <button className="icon-only" onClick={() => requestDeleteSavedMeal(meal)} aria-label={`Delete ${meal.name}`}><Trash2 size={15} /></button>
              <button className="secondary small" onClick={() => onLogSavedMeal(meal, mealType)}>Add</button>
            </div>
          </div>
        )) : <Empty title="None saved yet" text="Eat the same thing often? Save it and add it in one tap next time." />}
      </div>
    </section>
  );
}

function normalizeExercises(exercises: StrengthExercise[]): StrengthExercise[] {
  return exercises.map((exercise) => ({ ...exercise, sets: exercise.sets || [] }));
}

function TrainingView({
  date,
  session,
  programs,
  onSaveStrength,
  onSaveProgram,
  onDeleteProgram
}: {
  date: string;
  session?: StrengthSession;
  programs: TrainingProgram[];
  onSaveStrength: (session: StrengthSession) => Promise<void>;
  onSaveProgram: (program: TrainingProgram) => Promise<void>;
  onDeleteProgram: (id: string) => Promise<void>;
}) {
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const mondayFirstDay = weekday === 0 ? 6 : weekday - 1;

  const [expandedExercises, setExpandedExercises] = useState<Set<number>>(new Set());
  const [exerciseModalOpen, setExerciseModalOpen] = useState(false);
  const [exerciseName, setExerciseName] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState(programs[0]?.id || '');
  const [viewDayIndex, setViewDayIndex] = useState(mondayFirstDay);
  const [dayNameDraft, setDayNameDraft] = useState('');
  const [daySearch, setDaySearch] = useState('');
  const [programsSheetOpen, setProgramsSheetOpen] = useState(false);
  const [newProgramName, setNewProgramName] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<{ text: string; onConfirm: () => void } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());

  const selectedProgram = programs.find((program) => program.id === selectedProgramId) || programs[0];
  const todaysProgramDayRaw = selectedProgram?.days.find((day) => day.weekday === mondayFirstDay);
  const todaysProgramDay = todaysProgramDayRaw?.isRestDay ? undefined : todaysProgramDayRaw;
  const viewedDay = selectedProgram?.days.find((day) => day.weekday === viewDayIndex);

  const [template, setTemplate] = useState(session?.templateName || todaysProgramDay?.name || '');
  const [exercises, setExercises] = useState<StrengthExercise[]>(() => {
    if (session) return normalizeExercises(session.exercises);
    if (todaysProgramDay) return todaysProgramDay.exercises.map((name) => ({ name, sets: [{ weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0 }] }));
    return [];
  });

  useEffect(() => {
    if (session) {
      setTemplate(session.templateName);
      setExercises(normalizeExercises(session.exercises));
      return;
    }
    setTemplate(todaysProgramDay?.name || '');
    setExercises(todaysProgramDay ? todaysProgramDay.exercises.map((name) => ({ name, sets: [{ weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0 }] })) : []);
  }, [session, todaysProgramDay]);

  useEffect(() => {
    if (programs.length && !programs.some((program) => program.id === selectedProgramId)) setSelectedProgramId(programs[0].id);
  }, [programs, selectedProgramId]);

  useEffect(() => {
    setDayNameDraft(viewedDay?.name || '');
    setDaySearch('');
    setSelectMode(false);
    setSelectedIndexes(new Set());
  }, [viewDayIndex, selectedProgramId, viewedDay?.name]);

  function toggleExpanded(exerciseIndex: number) {
    setExpandedExercises((current) => {
      const next = new Set(current);
      if (next.has(exerciseIndex)) next.delete(exerciseIndex); else next.add(exerciseIndex);
      return next;
    });
  }

  function updateSet(exerciseIndex: number, setIndex: number, field: 'weightKg' | 'reps', value: number) {
    setExercises((current) => current.map((exercise, i) => i !== exerciseIndex ? exercise : {
      ...exercise,
      sets: exercise.sets.map((set, j) => j !== setIndex ? set : { ...set, [field]: value })
    }));
  }

  function addExercise(name?: string) {
    const cleanName = (name ?? exerciseName).trim();
    if (!cleanName) return;
    setExercises([...exercises, { name: cleanName, sets: [{ weightKg: 0, reps: 0 }] }]);
    setExpandedExercises((current) => new Set(current).add(exercises.length));
    if (!template) setTemplate('Workout');
    setExerciseName('');
    setExerciseModalOpen(false);
  }

  function updateViewedDay(update: Partial<Pick<ProgramDay, 'name' | 'exercises' | 'isRestDay'>>) {
    if (!selectedProgram) return;
    const exists = selectedProgram.days.some((day) => day.weekday === viewDayIndex);
    const nextDays = exists
      ? selectedProgram.days.map((day) => day.weekday === viewDayIndex ? { ...day, ...update } : day)
      : [...selectedProgram.days, { id: uid('program-day'), weekday: viewDayIndex, name: 'Workout', exercises: [], ...update }].sort((a, b) => a.weekday - b.weekday);
    void onSaveProgram({ ...selectedProgram, days: nextDays });
  }

  function commitDayName() {
    const clean = dayNameDraft.trim();
    if (!viewedDay || !clean || clean === viewedDay.name) return;
    updateViewedDay({ name: clean });
  }

  function addExerciseToDay(name: string) {
    const clean = name.trim();
    if (!clean) return;
    updateViewedDay({ name: viewedDay?.name || dayNameDraft.trim() || 'Workout', exercises: [...(viewedDay?.exercises || []), clean], isRestDay: false });
    setDaySearch('');
  }

  function useTemplateForDay(templateName: string) {
    updateViewedDay({ name: templateName, exercises: [...templateSeeds[templateName]], isRestDay: false });
    setDayNameDraft(templateName);
  }

  function toggleRestDay() {
    updateViewedDay({ isRestDay: !viewedDay?.isRestDay });
  }

  function removeExerciseFromDay(index: number) {
    if (!viewedDay) return;
    const name = viewedDay.exercises[index];
    setConfirmTarget({
      text: `Remove "${name}" from ${weekDays[viewDayIndex].full}?`,
      onConfirm: () => updateViewedDay({ exercises: viewedDay.exercises.filter((_, i) => i !== index) })
    });
  }

  function toggleSelectMode() {
    setSelectMode((current) => !current);
    setSelectedIndexes(new Set());
  }

  function toggleExerciseSelected(index: number) {
    setSelectedIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  function requestDeleteSelected() {
    if (!viewedDay || !selectedIndexes.size) return;
    const count = selectedIndexes.size;
    setConfirmTarget({
      text: `Remove ${count} exercise${count === 1 ? '' : 's'} from ${weekDays[viewDayIndex].full}?`,
      onConfirm: () => {
        updateViewedDay({ exercises: viewedDay.exercises.filter((_, i) => !selectedIndexes.has(i)) });
        setSelectMode(false);
        setSelectedIndexes(new Set());
      }
    });
  }

  function requestDeleteProgram(program: TrainingProgram) {
    setConfirmTarget({
      text: `Delete "${program.name}"? This removes the whole program and can't be undone.`,
      onConfirm: () => {
        void onDeleteProgram(program.id);
        if (program.id === selectedProgram?.id) setSelectedProgramId(programs.find((item) => item.id !== program.id)?.id || '');
      }
    });
  }

  function createProgram() {
    const name = newProgramName.trim();
    if (!name) return;
    const program: TrainingProgram = { id: uid('program'), name, days: [] };
    void onSaveProgram(program);
    setSelectedProgramId(program.id);
    setNewProgramName('');
    setProgramsSheetOpen(false);
  }

  return (
    <section className="stack view training-view">
      <div className="panel program-overview">
        <div className="panel-head">
          <div><p className="eyebrow">Your week</p><h2>{selectedProgram?.name || 'No program yet'}</h2></div>
          <button className="secondary small" onClick={() => setProgramsSheetOpen(true)}>Program <ChevronDown size={14} /></button>
        </div>
        {selectedProgram ? (
          <div className="program-days">{weekDays.map((day, index) => {
            const programDay = selectedProgram.days.find((item) => item.weekday === index);
            const isRest = !programDay || programDay.isRestDay;
            return (
              <button type="button" className={`program-day ${index === mondayFirstDay ? 'today' : ''} ${!isRest ? 'planned' : ''} ${index === viewDayIndex ? 'viewing' : ''}`} key={day.label} onClick={() => setViewDayIndex(index)}>
                <span>{day.label}</span>
                {!isRest ? <><strong>{programDay!.name}</strong><small>{programDay!.exercises.length} exercises</small></> : <small>{programDay ? 'Rest' : 'Rest — tap to add'}</small>}
              </button>
            );
          })}</div>
        ) : <Empty title="No program yet" text="Tap Program above to create your first one — push/pull/legs, upper/lower, full body, whatever works for you." />}
      </div>

      {selectedProgram ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">{weekDays[viewDayIndex].full}</p>
              <input className="day-name-input" value={dayNameDraft} onChange={(e) => setDayNameDraft(e.target.value)} onBlur={commitDayName} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} placeholder="Rest day" disabled={Boolean(viewedDay?.isRestDay)} />
            </div>
            <label className="rest-day-toggle">
              <input type="checkbox" checked={Boolean(viewedDay?.isRestDay)} onChange={toggleRestDay} />
              Rest day
            </label>
          </div>
          {viewedDay?.isRestDay ? (
            <Empty title="Marked as a rest day" text="Exercises for this day are hidden but kept. Uncheck 'Rest day' above to bring them back." />
          ) : (
            <>
              <div className="template-pills">{Object.keys(templateSeeds).map((name) => <button key={name} onClick={() => useTemplateForDay(name)}>Use {name}</button>)}</div>
              {viewedDay?.exercises.length ? (
                <div className="exercise-list-toolbar">
                  <button className="text-button" onClick={toggleSelectMode}>{selectMode ? 'Cancel' : 'Select'}</button>
                  {selectMode ? (
                    <>
                      <button className="text-button" onClick={() => setSelectedIndexes(new Set(viewedDay.exercises.map((_, i) => i)))}>Select all</button>
                      <button className="danger-button small" onClick={requestDeleteSelected} disabled={!selectedIndexes.size}>
                        <Trash2 size={13} /> Delete{selectedIndexes.size ? ` (${selectedIndexes.size})` : ''}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
              <div className="program-exercise-list">
                {viewedDay?.exercises.length ? viewedDay.exercises.map((name, index) => (
                  <div key={`${name}-${index}`}>
                    {selectMode ? (
                      <input type="checkbox" checked={selectedIndexes.has(index)} onChange={() => toggleExerciseSelected(index)} />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                    <strong>{name}</strong>
                    {selectMode ? <span /> : <button className="icon-only" onClick={() => removeExerciseFromDay(index)} aria-label={`Remove ${name}`}><X size={15} /></button>}
                  </div>
                )) : <p className="hint">Nothing planned for this day yet.</p>}
              </div>
              <div className="add-program-exercise">
                <input value={daySearch} onChange={(e) => setDaySearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addExerciseToDay(daySearch)} placeholder="Search exercises or type your own..." />
                <button className="secondary small" onClick={() => addExerciseToDay(daySearch)} disabled={!daySearch.trim()}><Plus size={14} /> Add</button>
              </div>
              {daySearch.trim() ? (
                <div className="exercise-search-results">
                  {allKnownExercises
                    .filter((name) => name.toLowerCase().includes(daySearch.trim().toLowerCase()) && !(viewedDay?.exercises || []).includes(name))
                    .slice(0, 8)
                    .map((name) => (
                      <button key={name} onClick={() => addExerciseToDay(name)}>
                        <Plus size={13} /> {name}
                      </button>
                    ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {selectedProgram && viewDayIndex === mondayFirstDay ? (
        <div className="panel">
          <div className="panel-head">
            <div><p className="eyebrow">Today's session</p><h2>{template || 'Rest day'}</h2></div>
            <button className="secondary small" onClick={() => setExerciseModalOpen(true)}><Plus size={14} /> Add exercise</button>
          </div>
          {exercises.length ? <TrainingMusclePreview exercises={exercises} /> : null}
          {exercises.length ? (
            <div className="exercise-list">
              {exercises.map((exercise, exerciseIndex) => {
                const isOpen = expandedExercises.has(exerciseIndex);
                return (
                  <div className={`exercise-card ${isOpen ? 'open' : ''}`} key={`${exercise.name}-${exerciseIndex}`}>
                    <button className="exercise-card-head" onClick={() => toggleExpanded(exerciseIndex)}>
                      <input className="exercise-name" value={exercise.name} onClick={(e) => e.stopPropagation()} onChange={(e) => setExercises(exercises.map((item, i) => i === exerciseIndex ? { ...item, name: e.target.value } : item))} />
                      <span className="exercise-card-meta">{exercise.sets.length} {exercise.sets.length === 1 ? 'set' : 'sets'}</span>
                      <ChevronDown className="exercise-card-chevron" size={16} aria-hidden="true" />
                    </button>
                    {isOpen ? (
                      <div className="exercise-card-body">
                        {exercise.sets.map((set, setIndex) => (
                          <div className="set-line" key={setIndex}>
                            <span>{setIndex + 1}</span>
                            <input inputMode="decimal" value={set.weightKg || ''} onChange={(e) => updateSet(exerciseIndex, setIndex, 'weightKg', Number(e.target.value) || 0)} placeholder="kg" />
                            <input inputMode="numeric" value={set.reps || ''} onChange={(e) => updateSet(exerciseIndex, setIndex, 'reps', Number(e.target.value) || 0)} placeholder="reps" />
                            <button className="icon-only" onClick={() => setExercises(exercises.map((item, i) => i === exerciseIndex ? { ...item, sets: item.sets.filter((_, j) => j !== setIndex) } : item))}>x</button>
                          </div>
                        ))}
                        <button className="text-button" onClick={() => setExercises(exercises.map((item, i) => i === exerciseIndex ? { ...item, sets: [...item.sets, { weightKg: 0, reps: 0 }] } : item))}>Add set</button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (!todaysProgramDayRaw || todaysProgramDayRaw.isRestDay) ? (
            <Empty title="Rest day" text="Nothing scheduled for today. Add an exercise above if you're training anyway, or plan this day above." />
          ) : (
            <Empty title="Nothing added yet" text={`"${todaysProgramDayRaw.name}" is on today's plan but has no exercises yet. Add some above, or add them to the plan above.`} />
          )}
          {exercises.length ? (
            <button className="primary" onClick={() => onSaveStrength({ id: session?.id || uid('strength'), date, templateName: template, exercises })}>
              <Save size={16} /> Save this workout
            </button>
          ) : null}
        </div>
      ) : null}

      {exerciseModalOpen ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Add exercise">
          <div className="panel modal-card">
            <div className="panel-head"><div><p className="eyebrow">New exercise</p><h2>What are you adding?</h2></div><button className="icon-only" onClick={() => setExerciseModalOpen(false)} aria-label="Close"><X size={17} /></button></div>
            <p className="hint">Anything you’re doing today, even if it’s not on the plan.</p>
            <label className="modal-field">Exercise name<input value={exerciseName} onChange={(e) => setExerciseName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && addExercise()} placeholder="e.g. Cable fly" /></label>
            {exerciseName.trim() ? (
              <div className="exercise-search-results">
                {allKnownExercises
                  .filter((name) => name.toLowerCase().includes(exerciseName.trim().toLowerCase()) && !exercises.some((item) => item.name === name))
                  .slice(0, 8)
                  .map((name) => (
                    <button key={name} onClick={() => addExercise(name)}>
                      <Plus size={13} /> {name}
                    </button>
                  ))}
              </div>
            ) : null}
            <button className="primary" onClick={() => addExercise()} disabled={!exerciseName.trim()}><Plus size={16} /> Add "{exerciseName.trim()}" as custom</button>
          </div>
        </div>
      ) : null}

      {programsSheetOpen ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Programs">
          <div className="panel modal-card">
            <div className="panel-head"><div><p className="eyebrow">Your programs</p><h2>Switch or create</h2></div><button className="icon-only" onClick={() => setProgramsSheetOpen(false)} aria-label="Close"><X size={17} /></button></div>
            {programs.length ? (
              <div className="programs-list">
                {programs.map((program) => (
                  <div key={program.id} className={`programs-list-row ${program.id === selectedProgram?.id ? 'active' : ''}`}>
                    <button className="programs-list-select" onClick={() => { setSelectedProgramId(program.id); setProgramsSheetOpen(false); }}>
                      <strong>{program.name}</strong>
                      <small>{program.days.length} day{program.days.length === 1 ? '' : 's'} planned</small>
                    </button>
                    <button className="icon-only" onClick={() => requestDeleteProgram(program)} aria-label={`Delete ${program.name}`}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            ) : <p className="hint">No programs yet — create your first one below.</p>}
            <label className="modal-field">New program name<input value={newProgramName} onChange={(e) => setNewProgramName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createProgram()} placeholder="e.g. Five day PPL" /></label>
            <button className="primary" onClick={createProgram} disabled={!newProgramName.trim()}><Plus size={16} /> Create program</button>
          </div>
        </div>
      ) : null}

      {confirmTarget ? (
        <div className="sheet" role="alertdialog" aria-modal="true" aria-label="Confirm">
          <div className="panel modal-card confirm-card">
            <h2>Are you sure?</h2>
            <p className="hint">{confirmTarget.text}</p>
            <div className="confirm-actions">
              <button className="secondary" onClick={() => setConfirmTarget(null)}>Cancel</button>
              <button className="danger-button" onClick={() => { confirmTarget.onConfirm(); setConfirmTarget(null); }}><Trash2 size={15} /> Remove</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const cardioMachineOrder: CardioMachine[] = ['treadmill', 'bike', 'stair_climber', 'elliptical', 'rowing', 'ski_erg', 'assault_bike', 'other'];

function CardioView({ date, cardio, steps, weightKg, savedSessions, onSaveCardio, onSaveSteps, onSaveCardioSession, onDeleteCardioSession }: {
  date: string;
  cardio: CardioEntry[];
  steps: number;
  weightKg: number;
  savedSessions: SavedCardioSession[];
  onSaveCardio: (entry: CardioEntry) => Promise<void>;
  onSaveSteps: (steps: number) => Promise<void>;
  onSaveCardioSession: (session: SavedCardioSession) => Promise<void>;
  onDeleteCardioSession: (id: string) => Promise<void>;
}) {
  const [machine, setMachine] = useState<CardioMachine>('treadmill');
  const [otherType, setOtherType] = useState('Walk');
  const [cardioForm, setCardioForm] = useState({ duration: '', distance: '', speed: '', incline: '', watts: '', stepRate: '', calories: '' });
  const [cyclingEffort, setCyclingEffort] = useState<CyclingEffort | 'custom'>('hard');
  const [rowingEffort, setRowingEffort] = useState<RowingEffort | 'custom'>('medium');
  const [saveAsSession, setSaveAsSession] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ text: string; onConfirm: () => void } | null>(null);
  const [stepInput, setStepInput] = useState(String(steps || ''));
  const totalMinutes = cardio.reduce((total, entry) => total + entry.durationMin, 0);

  useEffect(() => setStepInput(String(steps || '')), [steps, date]);

  const minutes = Number(cardioForm.duration) || 0;
  const estimate = estimateCardioCalories({
    machine,
    weightKg,
    minutes,
    speedKmh: Number(cardioForm.speed) || undefined,
    inclinePercent: cardioForm.incline ? Number(cardioForm.incline) : undefined,
    watts: Number(cardioForm.watts) || undefined,
    stepRate: Number(cardioForm.stepRate) || undefined,
    cyclingEffort: cyclingEffort === 'custom' ? undefined : cyclingEffort,
    rowingEffort: rowingEffort === 'custom' ? undefined : rowingEffort
  });

  function resetForm() {
    setCardioForm({ duration: '', distance: '', speed: '', incline: '', watts: '', stepRate: '', calories: '' });
    setOtherType('Walk');
    setCyclingEffort('hard');
    setRowingEffort('medium');
    setSaveAsSession(false);
    setSessionName('');
    setEditingSessionId(null);
  }

  function sessionConfig(): Omit<SavedCardioSession, 'id' | 'name'> {
    return {
      machine,
      durationMin: minutes || undefined,
      distanceKm: Number(cardioForm.distance) || undefined,
      speedKmh: machine === 'treadmill' ? Number(cardioForm.speed) || undefined : undefined,
      inclinePercent: machine === 'treadmill' && cardioForm.incline ? Number(cardioForm.incline) : undefined,
      watts: (machine === 'bike' || machine === 'assault_bike' || machine === 'rowing') ? Number(cardioForm.watts) || undefined : undefined,
      stepRate: machine === 'stair_climber' && cardioForm.stepRate ? Number(cardioForm.stepRate) : undefined
    };
  }

  function saveCardioEntry() {
    const type = machine === 'other' ? otherType.trim() : cardioMachineLabels[machine];
    if (!type || !minutes) return;
    void onSaveCardio({
      id: uid('cardio'),
      date,
      type,
      calories: Number(cardioForm.calories) || estimate || undefined,
      ...sessionConfig(),
      durationMin: minutes
    });
    if (saveAsSession && sessionName.trim()) {
      void onSaveCardioSession({ id: uid('cardio-session'), name: sessionName.trim(), ...sessionConfig() });
    }
    resetForm();
  }

  function useSavedSession(saved: SavedCardioSession) {
    setMachine(saved.machine);
    setCardioForm({
      duration: saved.durationMin ? String(saved.durationMin) : '',
      distance: saved.distanceKm ? String(saved.distanceKm) : '',
      speed: saved.speedKmh ? String(saved.speedKmh) : '',
      incline: saved.inclinePercent !== undefined ? String(saved.inclinePercent) : '',
      watts: saved.watts ? String(saved.watts) : '',
      stepRate: saved.stepRate ? String(saved.stepRate) : '',
      calories: ''
    });
    if (saved.watts) {
      setCyclingEffort('custom');
      setRowingEffort('custom');
    }
  }

  function startEditSession(saved: SavedCardioSession) {
    useSavedSession(saved);
    setSessionName(saved.name);
    setEditingSessionId(saved.id);
    setSaveAsSession(true);
  }

  function saveSessionChanges() {
    if (!editingSessionId || !sessionName.trim()) return;
    void onSaveCardioSession({ id: editingSessionId, name: sessionName.trim(), ...sessionConfig() });
    resetForm();
  }

  function requestDeleteSession(saved: SavedCardioSession) {
    setConfirmTarget({
      text: `Delete "${saved.name}"? This can't be undone.`,
      onConfirm: () => void onDeleteCardioSession(saved.id)
    });
  }

  const canSave = minutes > 0 && (machine !== 'other' || otherType.trim()) && (machine !== 'treadmill' || Number(cardioForm.speed) > 0);

  return <>
    <p className="eyebrow cardio-section-label">Cardio</p>
    <div className="panel cardio-log-panel">
      <div className="panel-head"><div><p className="eyebrow">Today</p><h2>Add a session</h2></div><span className="cardio-total">{totalMinutes} min</span></div>

      <div className="segmented cardio-machine-picker">
        {cardioMachineOrder.map((key) => <button key={key} className={machine === key ? 'active' : ''} onClick={() => setMachine(key)}>{cardioMachineLabels[key]}</button>)}
      </div>

      {machine === 'bike' || machine === 'assault_bike' ? (
        <div className="effort-picker">
          <p className="eyebrow">Effort {cyclingEffort !== 'custom' ? `(~${cyclingEffortLevels[cyclingEffort].watts}W)` : ''}</p>
          <div className="cardio-machine-picker">
            {(Object.keys(cyclingEffortLevels) as CyclingEffort[]).map((key) => (
              <button key={key} className={cyclingEffort === key ? 'active' : ''} onClick={() => setCyclingEffort(key)}>{cyclingEffortLevels[key].label}</button>
            ))}
            <button className={cyclingEffort === 'custom' ? 'active' : ''} onClick={() => setCyclingEffort('custom')}>Custom</button>
          </div>
        </div>
      ) : null}

      {machine === 'rowing' ? (
        <div className="effort-picker">
          <p className="eyebrow">Effort</p>
          <div className="cardio-machine-picker">
            {(Object.keys(rowingEffortLevels) as RowingEffort[]).map((key) => (
              <button key={key} className={rowingEffort === key ? 'active' : ''} onClick={() => setRowingEffort(key)}>{rowingEffortLevels[key].label}</button>
            ))}
            <button className={rowingEffort === 'custom' ? 'active' : ''} onClick={() => setRowingEffort('custom')}>Custom</button>
          </div>
        </div>
      ) : null}

      <div className="grid two">
        {machine === 'other' ? (
          <label>Activity<input value={otherType} onChange={(e) => setOtherType(e.target.value)} placeholder="Walk, swim, hike..." /></label>
        ) : null}
        <label>How long<input value={cardioForm.duration} onChange={(e) => setCardioForm({ ...cardioForm, duration: e.target.value })} inputMode="numeric" placeholder="minutes" /></label>

        {machine === 'treadmill' ? (
          <>
            <label>Speed<input value={cardioForm.speed} onChange={(e) => setCardioForm({ ...cardioForm, speed: e.target.value })} inputMode="decimal" placeholder="km/h" /></label>
            <label>Incline <span className="label-optional">optional</span><input value={cardioForm.incline} onChange={(e) => setCardioForm({ ...cardioForm, incline: e.target.value })} inputMode="decimal" placeholder="% grade" /></label>
          </>
        ) : null}

        {(machine === 'bike' || machine === 'assault_bike') && cyclingEffort === 'custom' ? (
          <label>Power<input value={cardioForm.watts} onChange={(e) => setCardioForm({ ...cardioForm, watts: e.target.value })} inputMode="decimal" placeholder="watts" /></label>
        ) : null}

        {machine === 'rowing' && rowingEffort === 'custom' ? (
          <label>Power<input value={cardioForm.watts} onChange={(e) => setCardioForm({ ...cardioForm, watts: e.target.value })} inputMode="decimal" placeholder="watts" /></label>
        ) : null}

        {machine === 'stair_climber' ? (
          <label>Step rate <span className="label-optional">optional</span><input value={cardioForm.stepRate} onChange={(e) => setCardioForm({ ...cardioForm, stepRate: e.target.value })} inputMode="decimal" placeholder="steps/min" /></label>
        ) : null}

        <label>Distance <span className="label-optional">optional</span><input value={cardioForm.distance} onChange={(e) => setCardioForm({ ...cardioForm, distance: e.target.value })} inputMode="decimal" placeholder="km" /></label>
        <label>Calories <span className="label-optional">{estimate ? `≈ ${estimate} estimated` : 'optional'}</span><input value={cardioForm.calories} onChange={(e) => setCardioForm({ ...cardioForm, calories: e.target.value })} inputMode="numeric" placeholder={estimate ? String(estimate) : 'kcal'} /></label>
      </div>

      {estimate ? <p className="hint cardio-estimate-note">Estimated from ACSM/Compendium formulas using your logged weight ({weightKg}kg) — leave Calories blank to use it, or override with your machine's own reading.</p> : null}

      {editingSessionId ? (
        <input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="Session name" />
      ) : (
        <label className="rest-day-toggle">
          <input type="checkbox" checked={saveAsSession} onChange={(e) => setSaveAsSession(e.target.checked)} />
          Save as a reusable session
        </label>
      )}
      {!editingSessionId && saveAsSession ? <input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="e.g. Push day treadmill" autoFocus /> : null}

      {editingSessionId ? (
        <div className="grid two">
          <button className="secondary" onClick={resetForm}>Cancel</button>
          <button className="primary" onClick={saveSessionChanges} disabled={!sessionName.trim()}><Save size={16} /> Save changes</button>
        </div>
      ) : (
        <button className="primary" onClick={saveCardioEntry} disabled={!canSave}><Bike size={16} /> Add it</button>
      )}
    </div>

    <div className="panel">
      <h2>Saved sessions</h2>
      {savedSessions.length ? savedSessions.map((saved) => (
        <div className="row" key={saved.id}>
          <div>
            <strong>{saved.name}</strong>
            <p>{cardioMachineLabels[saved.machine]}{saved.speedKmh ? ` · ${saved.speedKmh} km/h` : ''}{saved.inclinePercent ? ` · ${saved.inclinePercent}%` : ''}{saved.watts ? ` · ${saved.watts}W` : ''}{saved.stepRate ? ` · ${saved.stepRate} steps/min` : ''}</p>
          </div>
          <div className="saved-meal-actions">
            <button className="icon-only" onClick={() => startEditSession(saved)} aria-label={`Edit ${saved.name}`}><Pencil size={15} /></button>
            <button className="icon-only" onClick={() => requestDeleteSession(saved)} aria-label={`Delete ${saved.name}`}><Trash2 size={15} /></button>
            <button className="secondary small" onClick={() => useSavedSession(saved)}>Use</button>
          </div>
        </div>
      )) : <Empty title="None saved yet" text="Do the same routine often? Save it and skip the setup next time." />}
    </div>

    <div className="panel steps-panel">
      <div><p className="eyebrow">Every day</p><h2><Footprints size={20} /> Steps</h2><p className="hint">Walking counts too. Pop today’s number in.</p></div>
      <div className="steps-control"><input className="big-input" value={stepInput} onChange={(e) => setStepInput(e.target.value)} inputMode="numeric" placeholder="7000" /><button className="secondary small" onClick={() => onSaveSteps(Number(stepInput) || 0)}>Save</button></div>
    </div>
    <div className="panel cardio-history"><div className="panel-head"><div><p className="eyebrow">Today</p><h2>What you’ve done</h2></div><span>{cardio.length} session{cardio.length === 1 ? '' : 's'}</span></div>{cardio.length ? cardio.map((entry) => <div className="row cardio-row" key={entry.id}><div><strong>{entry.type}</strong><p>{entry.durationMin} minutes{entry.distanceKm ? ` · ${entry.distanceKm} km` : ''}{entry.speedKmh ? ` · ${entry.speedKmh} km/h` : ''}{entry.inclinePercent ? ` · ${entry.inclinePercent}%` : ''}{entry.watts ? ` · ${entry.watts}W` : ''}</p></div><span>{entry.calories ? `${entry.calories} kcal` : 'Done'}</span></div>) : <Empty title="Nothing yet" text="Walks, runs, rides — whatever you did, add it above." />}</div>

    {confirmTarget ? (
      <div className="sheet" role="alertdialog" aria-modal="true" aria-label="Confirm">
        <div className="panel modal-card confirm-card">
          <h2>Are you sure?</h2>
          <p className="hint">{confirmTarget.text}</p>
          <div className="confirm-actions">
            <button className="secondary" onClick={() => setConfirmTarget(null)}>Cancel</button>
            <button className="danger-button" onClick={() => { confirmTarget.onConfirm(); setConfirmTarget(null); }}><Trash2 size={15} /> Remove</button>
          </div>
        </div>
      </div>
    ) : null}
  </>;
}

function ProgressView({
  date,
  body,
  photos,
  workouts,
  onSaveBody,
  onSavePhoto
}: {
  date: string;
  body: BodyMetric[];
  photos: ProgressPhoto[];
  workouts: StrengthSession[];
  onSaveBody: (entry: BodyMetric) => Promise<void>;
  onSavePhoto: (file: File, label: string) => Promise<void>;
}) {
  const existing = body.find((item) => item.date === date);
  const [metric, setMetric] = useState({ weight: existing?.weightKg ? String(existing.weightKg) : '', waist: existing?.waistCm ? String(existing.waistCm) : '', bodyFat: existing?.bodyFatPercent ? String(existing.bodyFatPercent) : '' });
  const sortedBody = [...body].filter((item) => item.weightKg).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

  return (
    <section className="stack view progress-view">
      <MuscleMap workouts={workouts} date={date} />
      <div className="panel">
        <h2>Your weight over time</h2>
        <Trend points={sortedBody.map((item) => ({ date: item.date, value: item.weightKg || 0 }))} />
      </div>
      <div className="panel">
        <h2>Today’s numbers</h2>
        <div className="grid three">
          <input value={metric.weight} onChange={(e) => setMetric({ ...metric, weight: e.target.value })} inputMode="decimal" placeholder="kg" />
          <input value={metric.waist} onChange={(e) => setMetric({ ...metric, waist: e.target.value })} inputMode="decimal" placeholder="waist (cm)" />
          <input value={metric.bodyFat} onChange={(e) => setMetric({ ...metric, bodyFat: e.target.value })} inputMode="decimal" placeholder="body fat (%)" />
        </div>
        <button className="secondary" onClick={() => onSaveBody({ id: existing?.id || uid('body'), date, weightKg: Number(metric.weight) || undefined, waistCm: Number(metric.waist) || undefined, bodyFatPercent: Number(metric.bodyFat) || undefined })}>Save</button>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Photos</h2>
          <label className="upload-button"><Camera size={16} /> Add<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onSavePhoto(e.target.files[0], 'Progress')} /></label>
        </div>
        {photos.length ? <div className="photo-grid">{photos.map((photo) => <img key={photo.id} src={photo.url} alt={photo.label} />)}</div> : <Empty title="No photos yet" text="Front, side, back. Take them every few weeks and compare." />}
      </div>
      <div className="panel">
        <h2>Workouts you’ve done</h2>
        {workouts.length ? workouts.slice(0, 8).map((workout) => <div className="row" key={workout.id}><strong>{prettyDate(workout.date)} · {workout.templateName}</strong><span>{countSets(workout.exercises)} sets</span></div>) : <Empty title="No workouts yet" text="Once you save a session it’ll show up here." />}
      </div>
    </section>
  );
}

type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'core' | 'quads' | 'hamstrings' | 'glutes' | 'calves';

const muscleLabels: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  core: 'Core',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves'
};

function TrainingMusclePreview({ exercises }: { exercises: StrengthExercise[] }) {
  const scores = useMemo(() => {
    const next = new Map<MuscleGroup, number>();
    for (const exercise of exercises) {
      const plannedSets = Math.max(1, exercise.sets.length);
      for (const muscle of musclesForExercise(exercise.name)) {
        next.set(muscle, (next.get(muscle) || 0) + plannedSets);
      }
    }
    return next;
  }, [exercises]);
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const maximum = Math.max(1, ...scores.values());
  const fill = (muscle: MuscleGroup) => {
    const level = (scores.get(muscle) || 0) / maximum;
    return {
      '--muscle-opacity': String(level ? 0.24 + level * 0.76 : 0.035),
      '--muscle-stroke-opacity': String(level ? 0.35 + level * 0.65 : 0.14)
    } as CSSProperties;
  };

  return (
    <div className="training-muscle-preview">
      <div className="training-muscle-copy">
        <div><p className="eyebrow">Live preview</p><h3>Today’s muscles</h3></div>
        <p>Updates as you add or remove exercises. Stronger orange means more planned sets.</p>
        {ranked.length ? (
          <div className="training-muscle-chips">
            {ranked.slice(0, 6).map(([muscle, sets]) => <span key={muscle}>{muscleLabels[muscle]} <b>{sets}</b></span>)}
          </div>
        ) : <p className="muscle-empty">These exercise names aren’t mapped yet. Choose a library exercise for an accurate preview.</p>}
      </div>
      <div className="training-body-maps">
        <MuscleFigure side="Front" fill={fill} scores={scores} compact />
        <MuscleFigure side="Back" fill={fill} scores={scores} compact />
      </div>
    </div>
  );
}

type MuscleRange = 'day' | 'week' | 'month' | 'lastMonth';

const muscleRangeLabels: Record<MuscleRange, string> = {
  day: 'Day',
  week: 'This week',
  month: 'This month',
  lastMonth: 'Last month'
};

function muscleRangeDays(date: string, range: MuscleRange): string[] {
  if (range === 'day') return [date];
  if (range === 'week') return rangeDays(date, 'week');
  if (range === 'month') return rangeDays(date, 'month');
  const prevMonthAnchor = new Date(`${date}T00:00:00`);
  prevMonthAnchor.setDate(1);
  prevMonthAnchor.setMonth(prevMonthAnchor.getMonth() - 1);
  return rangeDays(todayKey(prevMonthAnchor), 'month');
}

function MuscleMap({ workouts, date }: { workouts: StrengthSession[]; date: string }) {
  const [range, setRange] = useState<MuscleRange>('week');
  const days = useMemo(() => muscleRangeDays(date, range), [date, range]);
  const from = days[0];
  const to = days[days.length - 1];
  const scores = useMemo(() => {
    const next = new Map<MuscleGroup, number>();

    for (const workout of workouts) {
      if (workout.date < from || workout.date > to) continue;
      for (const exercise of workout.exercises) {
        const completedSets = exercise.sets.filter((set) => set.reps > 0).length;
        if (!completedSets) continue;
        for (const muscle of musclesForExercise(exercise.name)) {
          next.set(muscle, (next.get(muscle) || 0) + completedSets);
        }
      }
    }
    return next;
  }, [from, to, workouts]);

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const maximum = Math.max(1, ...scores.values());
  const sessions = workouts.filter((workout) => workout.date >= from && workout.date <= to && workout.exercises.some((exercise) => exercise.sets.some((set) => set.reps > 0))).length;
  const fill = (muscle: MuscleGroup) => {
    const level = (scores.get(muscle) || 0) / maximum;
    return {
      '--muscle-opacity': String(level ? 0.24 + level * 0.76 : 0.035),
      '--muscle-stroke-opacity': String(level ? 0.35 + level * 0.65 : 0.14)
    } as CSSProperties;
  };

  return (
    <div className="panel muscle-map-panel">
      <div className="panel-head muscle-map-head">
        <div>
          <p className="eyebrow">Training load</p>
          <h2>Muscles you worked</h2>
          <p className="hint">Based on completed sets in your strength log.</p>
        </div>
        <div className="range-toggle" aria-label="Muscle history range">
          {(Object.keys(muscleRangeLabels) as MuscleRange[]).map((key) => (
            <button key={key} className={range === key ? 'active' : ''} onClick={() => setRange(key)}>{muscleRangeLabels[key]}</button>
          ))}
        </div>
      </div>

      <div className="muscle-map-content">
        <div className="body-maps" aria-label={`Muscle activity across ${sessions} workout${sessions === 1 ? '' : 's'}`}>
          <MuscleFigure side="Front" fill={fill} scores={scores} />
          <MuscleFigure side="Back" fill={fill} scores={scores} />
        </div>
        <div className="muscle-summary">
          <div className="muscle-map-stat"><strong>{sessions}</strong><span>workouts</span></div>
          <div className="muscle-map-stat"><strong>{[...scores.values()].reduce((sum, value) => sum + value, 0)}</strong><span>muscle sets</span></div>
          {ranked.length ? (
            <div className="muscle-chip-list">
              {ranked.map(([muscle, sets]) => <span key={muscle}><i style={fill(muscle)} />{muscleLabels[muscle]} <b>{sets}</b></span>)}
            </div>
          ) : <p className="muscle-empty">Complete some sets in Training and your body map will light up here.</p>}
          <div className="muscle-legend"><span>Less</span><i /><i /><i /><span>More</span></div>
        </div>
      </div>
    </div>
  );
}

function MuscleFigure({ side, fill, scores, compact }: {
  side: 'Front' | 'Back';
  fill: (muscle: MuscleGroup) => CSSProperties;
  scores: Map<MuscleGroup, number>;
  compact?: boolean;
}) {
  const region = (muscle: MuscleGroup) => ({
    className: 'muscle-region',
    style: fill(muscle),
    'aria-label': `${muscleLabels[muscle]}: ${scores.get(muscle) || 0} sets`
  });

  return (
    <figure className={`muscle-figure ${compact ? 'compact' : ''}`}>
      <svg viewBox="0 0 140 300" role="img" aria-label={`${side} muscle activity`}>
        <circle className="body-base" cx="70" cy="27" r="18" />
        <path className="body-base" d="M50 49 Q70 42 90 49 L103 116 91 164 86 282 69 282 65 174 58 282 41 282 37 164 25 116Z" />
        <path className="body-base" d="M30 58 15 123 22 177 35 174 33 121 48 75ZM110 58 125 123 118 177 105 174 107 121 92 75Z" />
        {side === 'Front' ? (
          <>
            <ellipse {...region('shoulders')} cx="45" cy="62" rx="15" ry="12" /><ellipse {...region('shoulders')} cx="95" cy="62" rx="15" ry="12" />
            <path {...region('chest')} d="M51 62 Q60 54 68 61 L67 91 Q56 94 48 84Z" /><path {...region('chest')} d="M89 62 Q80 54 72 61 L73 91 Q84 94 92 84Z" />
            <path {...region('biceps')} d="M29 73 Q39 74 40 84 L34 119 24 116Z" /><path {...region('biceps')} d="M111 73 Q101 74 100 84 L106 119 116 116Z" />
            <path {...region('forearms')} d="M23 119 34 122 31 169 22 171 17 127Z" /><path {...region('forearms')} d="M117 119 106 122 109 169 118 171 123 127Z" />
            <path {...region('core')} d="M54 94 Q70 100 86 94 L88 151 Q70 160 52 151Z" />
            <path {...region('quads')} d="M42 158 Q54 153 66 160 L61 220 43 222Z" /><path {...region('quads')} d="M98 158 Q86 153 74 160 L79 220 97 222Z" />
            <path {...region('calves')} d="M43 225 60 225 57 277 43 277Z" /><path {...region('calves')} d="M97 225 80 225 83 277 97 277Z" />
          </>
        ) : (
          <>
            <ellipse {...region('shoulders')} cx="45" cy="62" rx="15" ry="12" /><ellipse {...region('shoulders')} cx="95" cy="62" rx="15" ry="12" />
            <path {...region('back')} d="M50 61 Q70 52 90 61 L91 112 81 139 70 147 59 139 49 112Z" />
            <path {...region('triceps')} d="M29 73 Q39 74 40 84 L34 119 24 116Z" /><path {...region('triceps')} d="M111 73 Q101 74 100 84 L106 119 116 116Z" />
            <path {...region('forearms')} d="M23 119 34 122 31 169 22 171 17 127Z" /><path {...region('forearms')} d="M117 119 106 122 109 169 118 171 123 127Z" />
            <path {...region('glutes')} d="M42 148 Q57 141 68 153 L66 178 Q51 184 39 171Z" /><path {...region('glutes')} d="M98 148 Q83 141 72 153 L74 178 Q89 184 101 171Z" />
            <path {...region('hamstrings')} d="M41 178 Q53 174 65 180 L61 224 43 222Z" /><path {...region('hamstrings')} d="M99 178 Q87 174 75 180 L79 224 97 222Z" />
            <path {...region('calves')} d="M43 225 60 225 57 277 43 277Z" /><path {...region('calves')} d="M97 225 80 225 83 277 97 277Z" />
          </>
        )}
      </svg>
      <figcaption>{side}</figcaption>
    </figure>
  );
}

function musclesForExercise(exerciseName: string): MuscleGroup[] {
  const name = exerciseName.toLowerCase();
  const muscles = new Set<MuscleGroup>();
  const add = (...groups: MuscleGroup[]) => groups.forEach((group) => muscles.add(group));

  if (/stretch|mobility|roll\b|pose\b|warm-up|warm up|arm circle/.test(name)) return [];

  if (/bench|chest|fly|push-up|push up|svend|floor press|dip/.test(name)) add('chest', 'triceps', 'shoulders');
  if (/row|pulldown|pull-up|pull up|chin-up|chin up|pullover|lever|shrug/.test(name)) add('back', 'biceps');
  if (/shoulder|overhead press|lateral raise|front raise|rear delt|face pull|upright row|arnold|handstand/.test(name)) add('shoulders');
  if ((/curl|chin-up|chin up/.test(name)) && !/leg curl|hamstring curl|wrist curl/.test(name)) add('biceps');
  if (/tricep|pushdown|skull|french press|close grip|diamond|overhead.*extension|extension.*(tricep|arm)/.test(name)) add('triceps');
  if (/wrist|forearm|farmer|gripper|dead hang/.test(name)) add('forearms');
  if (/crunch|plank|sit-up|sit up|leg raise|pallof|woodchop|ab wheel|russian twist|dead bug|l-sit/.test(name)) add('core');
  if (/squat|leg press|leg extension|lunge|step-up|step up|split squat|wall sit/.test(name)) add('quads', 'glutes');
  if (/deadlift|romanian|leg curl|hamstring|good morning|hip hinge|back extension/.test(name)) add('hamstrings', 'glutes');
  if (/deadlift|back extension/.test(name)) add('back');
  if (/hip thrust|glute|kickback|abduction/.test(name)) add('glutes');
  if (/calf|calves/.test(name)) add('calves');
  return [...muscles];
}

/** Each of calories/protein/fat/carbs falls back to the auto-calculated value unless the user overrode it; fat and carbs still rebalance around whichever calorie number ends up in effect. */
function effectiveTargets(
  auto: ReturnType<typeof calculateTargets>,
  overrides: { calories: number | null; protein: number | null; fat: number | null; carbs: number | null }
) {
  const calorieTarget = overrides.calories ?? auto.calorieTarget;
  const proteinTargetG = overrides.protein ?? auto.proteinTargetG;
  const fatTargetG = overrides.fat ?? roundTo((calorieTarget * 0.25) / 9, 5);
  const carbTargetG = overrides.carbs ?? Math.max(0, roundTo((calorieTarget - proteinTargetG * 4 - fatTargetG * 9) / 4, 5));
  return { ...auto, calorieTarget, proteinTargetG, fatTargetG, carbTargetG };
}

type SettingsSection = 'about' | 'account';

const settingsSections: Array<{ key: SettingsSection; label: string }> = [
  { key: 'about', label: 'About you' },
  { key: 'account', label: 'Account' },
];

function ProfileView({ profile, localMode, onSave, onSignOut }: { profile: UserProfile; localMode: boolean; onSave: (profile: UserProfile) => Promise<void>; onSignOut: () => Promise<void> }) {
  const [section, setSection] = useState<SettingsSection>('about');
  const [draft, setDraft] = useState(profile);
  const baseline = calculateTargets(profile);
  const [manualCalories, setManualCalories] = useState<number | null>(() => (profile.calorieTarget !== baseline.calorieTarget ? profile.calorieTarget : null));
  const [manualProtein, setManualProtein] = useState<number | null>(() => (profile.proteinTargetG !== baseline.proteinTargetG ? profile.proteinTargetG : null));
  const [manualFat, setManualFat] = useState<number | null>(() => (profile.fatTargetG !== baseline.fatTargetG ? profile.fatTargetG : null));
  const [manualCarbs, setManualCarbs] = useState<number | null>(() => (profile.carbTargetG !== baseline.carbTargetG ? profile.carbTargetG : null));
  const autoCalc = calculateTargets(draft);
  const calculated = effectiveTargets(autoCalc, { calories: manualCalories, protein: manualProtein, fat: manualFat, carbs: manualCarbs });
  const macrosOverridden = manualProtein != null || manualFat != null || manualCarbs != null;

  function saveAbout() {
    void onSave({ ...draft, calorieTarget: profile.calorieTarget, proteinTargetG: profile.proteinTargetG, fatTargetG: profile.fatTargetG, carbTargetG: profile.carbTargetG });
  }

  function saveCalories() {
    void onSave({ ...profile, ...calculated });
  }

  return (
    <section className="stack view profile-view">
      <div className="settings-layout">
        <div className="settings-nav" role="tablist" aria-label="Settings section">
          {settingsSections.map((item) => (
            <button key={item.key} role="tab" aria-selected={section === item.key} className={section === item.key ? 'active' : ''} onClick={() => setSection(item.key)}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="settings-content">
          {section === 'about' ? (
            <>
              <div className="panel">
                <div className="grid two">
                  <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
                  <label>Age<input value={draft.age} onChange={(e) => setDraft({ ...draft, age: Number(e.target.value) || 0 })} inputMode="numeric" /></label>
                  <label>Height cm<input value={draft.heightCm} onChange={(e) => setDraft({ ...draft, heightCm: Number(e.target.value) || 0 })} inputMode="decimal" /></label>
                  <label>Weight kg<input value={draft.currentWeightKg} onChange={(e) => setDraft({ ...draft, currentWeightKg: Number(e.target.value) || 0 })} inputMode="decimal" /></label>
                  <label>Gender<select value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value as UserProfile['gender'] })}><option value="male">Male</option><option value="female">Female</option></select></label>
                  <label>Goal<select value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value as UserProfile['goal'] })}><option value="fat_loss">Lose fat</option><option value="recomp">Lose fat and build muscle</option><option value="muscle_gain">Build muscle</option><option value="maintain">Stay where I am</option></select></label>
                  <label>Days you train<input value={draft.trainingDaysPerWeek} onChange={(e) => setDraft({ ...draft, trainingDaysPerWeek: Number(e.target.value) || 0 })} inputMode="numeric" /></label>
                  <label>Daily steps<input value={draft.dailyStepsTarget} onChange={(e) => setDraft({ ...draft, dailyStepsTarget: Number(e.target.value) || 0 })} inputMode="numeric" /></label>
                  <label>Cardio days<input value={draft.cardioDaysPerWeek ?? 2} onChange={(e) => setDraft({ ...draft, cardioDaysPerWeek: Number(e.target.value) || 0 })} inputMode="numeric" /></label>
                  <label>Goal weight <span className="label-optional">optional</span><input value={draft.targetWeightKg ?? ''} onChange={(e) => setDraft({ ...draft, targetWeightKg: Number(e.target.value) || undefined })} inputMode="decimal" placeholder="kg" /></label>
                  <label>How you train<select value={draft.experienceLevel || ''} onChange={(e) => setDraft({ ...draft, experienceLevel: (e.target.value || undefined) as UserProfile['experienceLevel'] })}><option value="">Rather not say</option><option value="new">Brand new</option><option value="returning">Getting back into it</option><option value="intermediate">A year or two in</option><option value="advanced">Been at it for years</option></select></label>
                  <label>How fast<select value={draft.weeklyPace || 'steady'} onChange={(e) => setDraft({ ...draft, weeklyPace: e.target.value as UserProfile['weeklyPace'] })} disabled={draft.goal === 'maintain'}><option value="easy">Take it easy</option><option value="steady">Steady</option><option value="fast">Push it</option></select></label>
                </div>
                <button className="primary" onClick={saveAbout}><Save size={16} /> Save</button>
              </div>
              <div className="panel target-card">
                <p className="eyebrow">Your daily target</p>
                <div className="target-calorie-edit">
                  <input
                    className="target-calorie-input"
                    inputMode="numeric"
                    value={calculated.calorieTarget}
                    onChange={(e) => setManualCalories(Number(e.target.value) || 0)}
                  />
                  <span>kcal</span>
                </div>
                {manualCalories != null ? (
                  <button type="button" className="link-button" onClick={() => setManualCalories(null)}>Use calculated value ({autoCalc.calorieTarget} kcal)</button>
                ) : null}
                <div className="target-macro-edit">
                  <label>Protein (g)<input inputMode="numeric" value={calculated.proteinTargetG} onChange={(e) => setManualProtein(Number(e.target.value) || 0)} /></label>
                  <label>Carbs (g)<input inputMode="numeric" value={calculated.carbTargetG} onChange={(e) => setManualCarbs(Number(e.target.value) || 0)} /></label>
                  <label>Fat (g)<input inputMode="numeric" value={calculated.fatTargetG} onChange={(e) => setManualFat(Number(e.target.value) || 0)} /></label>
                </div>
                {macrosOverridden ? (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => { setManualProtein(null); setManualFat(null); setManualCarbs(null); }}
                  >
                    Use calculated macros ({autoCalc.proteinTargetG}p / {autoCalc.carbTargetG}c / {autoCalc.fatTargetG}f)
                  </button>
                ) : null}
                <p className="hint">You burn around {calculated.bmr} doing nothing, roughly {calculated.tdee} on a normal day.</p>
                <button className="primary" onClick={saveCalories}><Save size={16} /> Save</button>
              </div>
            </>
          ) : null}

          {section === 'account' ? (
            <AccountSection localMode={localMode} onSignOut={onSignOut} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AccountSection({ localMode, onSignOut }: { localMode: boolean; onSignOut: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<'email' | 'password' | null>(null);

  useEffect(() => {
    if (!supabase || localMode) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, [localMode]);

  async function changeEmail() {
    if (!supabase || !email.trim()) return;
    setBusy('email');
    setEmailStatus(null);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setBusy(null);
    setEmailStatus(error ? error.message : 'Check your inbox to confirm the new email.');
  }

  async function changePassword() {
    if (!supabase) return;
    if (password.length < 6) { setPasswordStatus('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setPasswordStatus('Passwords don\'t match.'); return; }
    setBusy('password');
    setPasswordStatus(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(null);
    setPasswordStatus(error ? error.message : 'Password updated.');
    if (!error) { setPassword(''); setConfirmPassword(''); }
  }

  return (
    <>
      {!localMode ? (
        <>
          <div className="panel">
            <h2>Email</h2>
            <div className="grid two">
              <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            </div>
            {emailStatus ? <p className="hint">{emailStatus}</p> : null}
            <button className="secondary" disabled={busy === 'email'} onClick={changeEmail}>{busy === 'email' ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Update email</button>
          </div>
          <div className="panel">
            <h2>Password</h2>
            <div className="grid two">
              <label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              <label>Confirm password<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
            </div>
            {passwordStatus ? <p className="hint">{passwordStatus}</p> : null}
            <button className="secondary" disabled={busy === 'password'} onClick={changePassword}>{busy === 'password' ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Update password</button>
          </div>
        </>
      ) : (
        <div className="panel">
          <p className="hint">You're using Ateform on this device only — nothing syncs to an account, so there's no email or password to manage.</p>
        </div>
      )}
      <div className="panel">
        <button className="secondary" onClick={onSignOut}><LogOut size={16} /> {localMode ? 'Leave this device' : 'Sign out'}</button>
      </div>
    </>
  );
}

function DateNav({ date, setDate }: { date: string; setDate: (date: string) => void }) {
  function move(days: number) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    setDate(todayKey(d));
  }
  return <div className="date-nav"><button onClick={() => move(-1)} aria-label="Previous day"><ChevronLeft size={16} /></button><span>{date === todayKey() ? 'Today' : prettyDate(date)}</span><button onClick={() => move(1)} aria-label="Next day"><ChevronRight size={16} /></button></div>;
}

function ProgressSummary({ date, profile, history }: { date: string; profile: UserProfile; history: TodayHistory }) {
  const [range, setRange] = useState<ProgressRange>('week');
  const days = useMemo(() => rangeDays(date, range), [date, range]);
  const elapsed = useMemo(() => days.filter((day) => day <= date), [days, date]);

  const intakeByDay = useMemo(() => {
    const map = new Map<string, { calories: number; protein: number }>();
    for (const entry of history.meals) {
      const current = map.get(entry.date) || { calories: 0, protein: 0 };
      current.calories += entry.nutrients.calories;
      current.protein += entry.nutrients.protein;
      map.set(entry.date, current);
    }
    return map;
  }, [history.meals]);

  const cardioByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of history.cardio) map.set(entry.date, (map.get(entry.date) || 0) + entry.durationMin);
    return map;
  }, [history.cardio]);

  const stepsByDay = useMemo(() => new Map(history.steps.map((entry) => [entry.date, entry.steps])), [history.steps]);
  const strengthDays = useMemo(() => new Set(history.strength.map((entry) => entry.date)), [history.strength]);

  const loggedDays = elapsed.filter((day) => (intakeByDay.get(day)?.calories || 0) > 0);
  const avgCalories = average(loggedDays.map((day) => intakeByDay.get(day)?.calories || 0));
  const avgProtein = average(loggedDays.map((day) => intakeByDay.get(day)?.protein || 0));
  const workouts = elapsed.filter((day) => strengthDays.has(day)).length;
  const workoutTarget = Math.max(1, Math.round((profile.trainingDaysPerWeek * days.length) / 7));
  const cardioMinutes = elapsed.reduce((sum, day) => sum + (cardioByDay.get(day) || 0), 0);
  const stepDays = elapsed.filter((day) => (stepsByDay.get(day) || 0) > 0);
  const avgSteps = average(stepDays.map((day) => stepsByDay.get(day) || 0));

  const weights = history.body
    .filter((entry) => entry.weightKg && entry.date >= days[0] && entry.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weightChange = weights.length > 1 ? (weights.at(-1)!.weightKg! - weights[0].weightKg!) : null;

  return (
    <div className="panel progress-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Zoom out</p>
          <h2>How you’re doing</h2>
        </div>
        <div className="range-toggle">
          <button className={range === 'week' ? 'active' : ''} onClick={() => setRange('week')}>Week</button>
          <button className={range === 'month' ? 'active' : ''} onClick={() => setRange('month')}>Month</button>
        </div>
      </div>

      <div className={`day-strip ${range}`}>
        {days.map((day, index) => {
          const calories = intakeByDay.get(day)?.calories || 0;
          const pct = profile.calorieTarget ? Math.min(100, (calories / profile.calorieTarget) * 100) : 0;
          const future = day > date;
          return (
            <div
              className={`day-col ${future ? 'future' : ''} ${day === date ? 'current' : ''}`}
              key={day}
              title={`${prettyDate(day)} · ${calories} kcal${strengthDays.has(day) ? ' · workout' : ''}`}
            >
              <span className="day-track">
                <i className={calories > profile.calorieTarget * 1.05 ? 'over' : ''} style={{ height: `${calories ? Math.max(pct, 6) : 0}%` }} />
              </span>
              <em className={strengthDays.has(day) ? 'trained' : ''} />
              {range === 'week' ? <span>{weekDays[index].label[0]}</span> : null}
            </div>
          );
        })}
      </div>
      <p className="strip-legend">
        Each bar is a day’s calories. A dot means you trained. You logged {loggedDays.length} of {elapsed.length} day
        {elapsed.length === 1 ? '' : 's'} this {range}.
      </p>

      <div className="stat-grid">
        <StatTile label="Calories a day" value={avgCalories ? avgCalories.toLocaleString() : '—'} hint={`you aim for ${profile.calorieTarget.toLocaleString()}`} pct={ratio(avgCalories, profile.calorieTarget)} />
        <StatTile label="Protein a day" value={avgProtein ? `${avgProtein}g` : '—'} hint={`you aim for ${profile.proteinTargetG}g`} pct={ratio(avgProtein, profile.proteinTargetG)} />
        <StatTile label="Workouts" value={String(workouts)} hint={`you planned ${workoutTarget}`} pct={ratio(workouts, workoutTarget)} />
        <StatTile label="Cardio" value={`${cardioMinutes}m`} hint={`this ${range}`} />
        <StatTile label="Steps a day" value={avgSteps ? avgSteps.toLocaleString() : '—'} hint={`you aim for ${profile.dailyStepsTarget.toLocaleString()}`} pct={ratio(avgSteps, profile.dailyStepsTarget)} />
        <StatTile
          label="Weight"
          value={weightChange === null ? '—' : `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg`}
          hint={weightChange === null ? 'weigh in twice to see this' : `this ${range}`}
        />
      </div>
    </div>
  );
}

function StatTile({ label, value, hint, pct }: { label: string; value: string; hint: string; pct?: number }) {
  return (
    <div className="stat-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      {pct === undefined ? null : <i><b style={{ width: `${pct}%` }} /></i>}
      <small>{hint}</small>
    </div>
  );
}

function Bar({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = Math.min(100, (value / target) * 100);
  return <div className="bar-row"><div><span>{label}</span><span className="mono">{value}{unit} / {target}{unit}</span></div><div className="bar"><i style={{ width: `${pct}%` }} /></div></div>;
}

function MacroMini({ nutrients }: { nutrients: { calories: number; protein: number; carbs: number; fat: number } }) {
  return <div className="macro-mini"><span>{nutrients.calories} kcal</span><span>{nutrients.protein}p</span><span>{nutrients.carbs}c</span><span>{nutrients.fat}f</span></div>;
}

function NutrientGrid({ nutrients, compact = false }: { nutrients: Food['nutrientsPer100g']; compact?: boolean }) {
  const rows = [
    { label: 'Fibre', value: nutrients.fiber, unit: 'g', target: 30 },
    { label: 'Sodium', value: nutrients.sodiumMg, unit: 'mg', target: 2300 },
    { label: 'Potassium', value: nutrients.potassiumMg, unit: 'mg', target: 3400 },
    { label: 'Calcium', value: nutrients.calciumMg, unit: 'mg', target: 1000 },
    { label: 'Iron', value: nutrients.ironMg, unit: 'mg', target: 8 },
    { label: 'Magnesium', value: nutrients.magnesiumMg, unit: 'mg', target: 420 },
    { label: 'Zinc', value: nutrients.zincMg, unit: 'mg', target: 11 },
    { label: 'Vitamin C', value: nutrients.vitaminCMg, unit: 'mg', target: 90 },
    { label: 'Vitamin D', value: nutrients.vitaminDUg, unit: 'µg', target: 15 },
    { label: 'B12', value: nutrients.vitaminB12Ug, unit: 'µg', target: 2.4 }
  ].filter((row) => row.value !== undefined && row.value !== null && Number(row.value) > 0);

  if (!rows.length) return null;
  const visibleRows = compact ? rows.slice(0, 4) : rows;
  return <div className={`nutrient-panel ${compact ? 'compact' : ''}`}>
    {!compact ? <div className="panel-head"><div><p className="eyebrow">The rest</p><h2>Vitamins and minerals</h2></div><span className="nutrient-note">vs a normal day</span></div> : <p className="eyebrow">Also in this portion</p>}
    <div className="nutrient-grid">{visibleRows.map((row) => {
      const value = Number(row.value);
      const progress = Math.min(100, (value / row.target) * 100);
      return <div className="nutrient-card" key={row.label}><div><span>{row.label}</span><strong>{value}{row.unit}</strong></div><i><b style={{ width: `${progress}%` }} /></i><small>{Math.round(progress)}% of a day</small></div>;
    })}</div>
    {!compact && rows.length < 10 ? <p className="nutrient-disclaimer">We only show what the food source actually reports. The daily numbers are rough adult guides, not medical advice.</p> : null}
  </div>;
}

function Trend({ points }: { points: Array<{ date: string; value: number }> }) {
  if (points.length < 2) return <Empty title="Not enough yet" text="Weigh in a few more times and a line will show up here." />;
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const span = Math.max(1, max - min);
  return <div className="trend">{points.map((point) => <div key={point.date} style={{ height: `${18 + ((point.value - min) / span) * 82}%` }}><span>{point.value}</span></div>)}</div>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><strong>{title}</strong><p>{text}</p></div>;
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactElement; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function countSets(exercises: StrengthExercise[]) {
  return exercises.reduce((sum, exercise) => sum + (exercise.sets || []).filter((set) => set.weightKg && set.reps).length, 0);
}

/** Every day key of the calendar week (Monday first) or calendar month containing `anchor`. */
function rangeDays(anchor: string, range: ProgressRange) {
  const date = new Date(`${anchor}T00:00:00`);
  if (range === 'week') {
    const weekday = date.getDay();
    const start = new Date(date);
    start.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return todayKey(day);
    });
  }
  const year = date.getFullYear();
  const month = date.getMonth();
  const total = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: total }, (_, index) => todayKey(new Date(year, month, index + 1)));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function ratio(value: number, target: number) {
  if (!target) return 0;
  return Math.min(100, Math.max(0, (value / target) * 100));
}

/** Foods like "1 large" (eggs) or "1 tbsp" (oil) are counted, not weighed — anything ending in a weight/volume unit stays gram-based. */
function isWeightUnit(unit?: string) {
  if (!unit) return true;
  return /(^|\s)(g|kg|ml|l)s?$/i.test(unit.trim());
}

/** Countable foods where the source rarely knows the per-item weight (e.g. USDA search results for "egg" only ever return generic 100g reference data). */
const countableFoodNames = /\begg(s)?\b/i;

function isPieceFood(food: Food) {
  if (food.servingUnit && !isWeightUnit(food.servingUnit)) return true;
  return countableFoodNames.test(food.name);
}

function defaultServingGrams(food: Food) {
  if (food.servingGrams) return food.servingGrams;
  if (countableFoodNames.test(food.name)) return 50;
  return 100;
}

function unitLabel(food: Food) {
  if (food.servingUnit && !isWeightUnit(food.servingUnit)) {
    return food.servingUnit.replace(/^\d+(\.\d+)?\s*/, '') || 'serving';
  }
  if (countableFoodNames.test(food.name)) return 'egg';
  return 'serving';
}

function foodCategory(name: string) {
  const text = name.toLowerCase();
  if (/beef|steak|burger|meatball|pork|bacon|ham\b/.test(text)) return { Icon: Beef, tint: '#8a3a2c' };
  if (/chicken|turkey|poultry|drumstick/.test(text)) return { Icon: Drumstick, tint: '#8a5a1f' };
  if (/egg/.test(text)) return { Icon: Egg, tint: '#8a7a1f' };
  if (/fish|salmon|tuna|shrimp|seafood/.test(text)) return { Icon: Fish, tint: '#1f6a8a' };
  if (/milk|yogurt|yoghurt|cheese|dairy/.test(text)) return { Icon: Milk, tint: '#5a5a5a' };
  if (/rice|bread|khobz|wheat|pasta|oat|grain/.test(text)) return { Icon: Wheat, tint: '#7a6320' };
  if (/apple|fruit|berry|banana|orange/.test(text)) return { Icon: Apple, tint: '#2f7a3d' };
  if (/carrot|vegetable|broccoli|spinach|pepper|onion/.test(text)) return { Icon: Carrot, tint: '#a05a1f' };
  return { Icon: Utensils, tint: '#5a5a5a' };
}

function mealToRow(entry: MealEntry, userId: string) {
  return {
    id: entry.id,
    user_id: userId,
    log_date: entry.date,
    meal_type: entry.mealType,
    meal_session_id: entry.mealSessionId,
    meal_source: entry.source || 'manual',
    source_metadata: entry.sourceMetadata || {},
    idempotency_key: entry.idempotencyKey || null,
    eaten_at: entry.createdAt,
    food_snapshot: entry.food,
    grams: entry.grams,
    nutrients: entry.nutrients,
    created_at: entry.createdAt
  };
}

function mealFromRow(row: any): MealEntry {
  return {
    id: row.id,
    date: row.log_date,
    mealType: row.meal_type,
    mealSessionId: row.meal_session_id || row.id,
    source: row.meal_source || 'manual',
    sourceMetadata: row.source_metadata || {},
    idempotencyKey: row.idempotency_key || undefined,
    food: row.food_snapshot,
    grams: row.grams,
    nutrients: row.nutrients,
    createdAt: row.eaten_at || row.created_at
  };
}

function profileToRow(profile: UserProfile) {
  return {
    id: profile.id,
    display_name: profile.name,
    age: profile.age,
    gender: profile.gender,
    height_cm: profile.heightCm,
    current_weight_kg: profile.currentWeightKg,
    training_days_per_week: profile.trainingDaysPerWeek,
    daily_steps_target: profile.dailyStepsTarget,
    goal: profile.goal,
    calorie_target: profile.calorieTarget,
    protein_target_g: profile.proteinTargetG,
    fat_target_g: profile.fatTargetG,
    carb_target_g: profile.carbTargetG,
    target_weight_kg: profile.targetWeightKg ?? null,
    experience_level: profile.experienceLevel ?? null,
    weekly_pace: profile.weeklyPace || 'steady',
    cardio_days_per_week: profile.cardioDaysPerWeek ?? 2,
    onboarded_at: profile.onboardedAt ?? null
  };
}

function profileFromRow(row: any): UserProfile {
  return {
    id: row.id,
    name: row.display_name || 'You',
    age: row.age || 21,
    gender: row.gender || 'male',
    heightCm: row.height_cm || 182,
    currentWeightKg: row.current_weight_kg || 80,
    trainingDaysPerWeek: row.training_days_per_week || 5,
    dailyStepsTarget: row.daily_steps_target || 7000,
    goal: row.goal || 'recomp',
    calorieTarget: row.calorie_target || 2450,
    proteinTargetG: row.protein_target_g || 170,
    fatTargetG: row.fat_target_g || 70,
    carbTargetG: row.carb_target_g || 285,
    targetWeightKg: row.target_weight_kg || undefined,
    experienceLevel: row.experience_level || undefined,
    weeklyPace: row.weekly_pace || 'steady',
    cardioDaysPerWeek: row.cardio_days_per_week ?? 2,
    onboardedAt: row.onboarded_at || null
  };
}
